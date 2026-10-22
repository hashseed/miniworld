// Streams the manifest, the startup index and chunks (spec milestone 1,
// section 10). Loading only decides what can be drawn; it never changes the
// computed world (section 10.7).

import type { Language } from '../i18n/messages.ts';
import { ancestorAt, tilePath, type TileKey } from '../geo/cube.ts';
import { PART_LEVEL } from './formats.ts';
import {
  chunkKey,
  type LayerManifest,
  type Manifest,
  type PartFile,
  type StartupIndex,
} from './types.ts';

const MAX_CONCURRENT = 6;
/** First pause after a failed request; it doubles with every failure up to RETRY_MAX_MS (section 10.4). */
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 60_000;

export type ChunkState = 'missing' | 'deep' | 'loading' | 'ready' | 'none';

/** What the renderers need from the loader: the manifest, chunk lookup and the request queue. */
export interface ChunkSource {
  readonly manifest: Manifest;
  lookup(
    layerName: string,
    key: TileKey,
    window: string,
    language?: string,
  ): string | 'deep' | 'none' | undefined;
  fetchChunk(
    file: string,
    priority: number,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer | undefined>;
  setPriority(file: string, priority: number): void;
}

export interface LoaderOptions {
  /** The fetch to use; tests pass a fake. */
  fetch?: typeof fetch;
  /** Milliseconds on a steady clock; tests pass a fake. Never part of the world. */
  now?: () => number;
}

interface Request {
  url: string;
  priority: number;
  controller: AbortController;
  resolve: (buf: ArrayBuffer | undefined) => void;
}

interface Failure {
  count: number;
  /** No new request before this time; Infinity for files that do not exist. */
  retryAt: number;
}

/** Thrown for a file that failed recently and is waiting for its retry time. */
export class RetryLaterError extends Error {}

export class ContentLoader implements ChunkSource {
  readonly base: string;
  manifest!: Manifest;
  /** Bytes transferred so far, for the first-view budget and stats. */
  bytesLoaded = 0;

  private indexCache = new Map<Language, Promise<StartupIndex>>();
  private parts = new Map<string, Promise<PartFile | undefined>>();
  private partData = new Map<string, PartFile>();
  private queue: Request[] = [];
  private active = 0;
  private failures = new Map<string, Failure>();
  private fetchFn: typeof fetch;
  private now: () => number;

  constructor(base = 'data/', options: LoaderOptions = {}) {
    this.base = base;
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => performance.now());
  }

  async init(): Promise<Manifest> {
    const res = await this.fetchFn(`${this.base}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Manifest not found (${res.status})`);
    this.manifest = (await res.json()) as Manifest;
    return this.manifest;
  }

  index(language: Language): Promise<StartupIndex> {
    let p = this.indexCache.get(language);
    if (!p) {
      p = this.fetchJson<StartupIndex>(this.manifest.index[language]);
      // A failed index is forgotten, so the next call asks again.
      p.catch(() => {
        if (this.indexCache.get(language) === p) this.indexCache.delete(language);
      });
      this.indexCache.set(language, p);
    }
    return p;
  }

  /**
   * Looks up a chunk file for a tile. Returns the file name, 'deep' for
   * terrain tiles that are entirely deep ocean, 'none' when the layer has no
   * chunk there, or undefined while the part index is still loading.
   */
  lookup(
    layerName: string,
    key: TileKey,
    window: string,
    language = 'xx',
  ): string | 'deep' | 'none' | undefined {
    const layer = this.manifest.layers[layerName] as LayerManifest | undefined;
    if (!layer) return 'none';
    const path = tilePath(key);
    const ck = chunkKey(path, window, language);
    if (key.level < PART_LEVEL) {
      if (layer.chunks[ck]) return layer.chunks[ck];
      return layer.deep?.includes(path) ? 'deep' : 'none';
    }
    const partPath = tilePath(ancestorAt(key, PART_LEVEL));
    const partFile = layer.parts[partPath];
    if (!partFile) return 'none';
    const id = `${layerName}:${partPath}`;
    const part = this.partData.get(id);
    if (!part) {
      if (!this.parts.has(id)) {
        this.parts.set(
          id,
          this.fetchJson<PartFile>(partFile).then(
            (p) => {
              this.partData.set(id, p);
              return p;
            },
            () => {
              this.parts.delete(id);
              return undefined;
            },
          ),
        );
      }
      return undefined;
    }
    if (part.chunks[ck]) return part.chunks[ck];
    return part.deep?.includes(path) ? 'deep' : 'none';
  }

  /** Fetches a chunk with a priority (lower first); resolves undefined if cancelled. */
  fetchChunk(
    file: string,
    priority: number,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer | undefined> {
    const url = this.base + file;
    if (this.waiting(url) || signal?.aborted) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const controller = new AbortController();
      signal?.addEventListener('abort', () => controller.abort());
      this.queue.push({ url, priority, controller, resolve });
      this.pump();
    });
  }

  /** Gives the waiting requests for a file a new priority (lower first). */
  setPriority(file: string, priority: number): void {
    const url = this.base + file;
    for (const r of this.queue) if (r.url === url) r.priority = priority;
  }

  /** True while a file that failed waits for its retry time (section 10.4). */
  private waiting(url: string): boolean {
    const f = this.failures.get(url);
    return f !== undefined && this.now() < f.retryAt;
  }

  private failed(url: string, status?: number): void {
    const count = (this.failures.get(url)?.count ?? 0) + 1;
    const retryAt =
      status === 404 || status === 410
        ? Infinity
        : this.now() + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (count - 1));
    this.failures.set(url, { count, retryAt });
  }

  get pending(): number {
    return this.queue.length + this.active;
  }

  /** Queued requests that have finished, loaded or not, since the loader was made. */
  finished = 0;

  private pump(): void {
    while (this.active < MAX_CONCURRENT && this.queue.length) {
      let best = 0;
      for (let i = 1; i < this.queue.length; i++)
        if (this.queue[i]!.priority < this.queue[best]!.priority) best = i;
      const req = this.queue.splice(best, 1)[0]!;
      if (req.controller.signal.aborted) {
        req.resolve(undefined);
        continue;
      }
      this.active++;
      this.fetchFn(req.url, { signal: req.controller.signal })
        .then(async (res) => {
          if (!res.ok) {
            this.failed(req.url, res.status);
            req.resolve(undefined);
            return;
          }
          const buf = await res.arrayBuffer();
          this.bytesLoaded += buf.byteLength;
          this.failures.delete(req.url);
          req.resolve(buf);
        })
        .catch(() => {
          // A cancelled request is not a failure.
          if (!req.controller.signal.aborted) this.failed(req.url);
          req.resolve(undefined);
        })
        .finally(() => {
          this.active--;
          this.finished++;
          this.pump();
        });
    }
  }

  /** Fetches a whole JSON file by name, such as a card's text. */
  json<T>(file: string): Promise<T> {
    return this.fetchJson<T>(file);
  }

  /** Fetches a whole file at startup, outside the chunk queue. */
  async fetchBytes(file: string): Promise<Uint8Array> {
    return new Uint8Array(await this.fetchWhole(file, (res) => res.arrayBuffer()));
  }

  private async fetchJson<T>(file: string): Promise<T> {
    return JSON.parse(await this.fetchWhole(file, (res) => res.text())) as T;
  }

  /**
   * Fetches a whole file outside the queue, under the same retry rules: a
   * file that failed recently rejects with RetryLaterError until its time.
   */
  private async fetchWhole<T extends string | ArrayBuffer>(
    file: string,
    read: (res: Response) => Promise<T>,
  ): Promise<T> {
    const url = this.base + file;
    if (this.waiting(url)) throw new RetryLaterError(`retry later: ${file}`);
    let res: Response;
    try {
      res = await this.fetchFn(url);
    } catch (e) {
      this.failed(url);
      throw e;
    }
    if (!res.ok) {
      this.failed(url, res.status);
      throw new Error(`${res.status} ${file}`);
    }
    const body = await read(res);
    this.bytesLoaded += typeof body === 'string' ? body.length : body.byteLength;
    this.failures.delete(url);
    return body;
  }
}
