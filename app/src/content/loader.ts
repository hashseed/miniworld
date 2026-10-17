// Streams the manifest, the startup index and chunks (spec milestone 1,
// section 10). Loading only decides what can be drawn; it never changes the
// computed world (section 10.7).

import type { Language } from '../i18n/messages.ts';
import { ancestorAt, tilePath, type TileKey } from '../globe/cube.ts';
import {
  chunkKey,
  type LayerManifest,
  type Manifest,
  type PartFile,
  type StartupIndex,
} from './types.ts';

const MAX_CONCURRENT = 6;
const PART_LEVEL = 2;

export type ChunkState = 'missing' | 'deep' | 'loading' | 'ready' | 'none';

interface Request {
  url: string;
  priority: number;
  controller: AbortController;
  resolve: (buf: ArrayBuffer | undefined) => void;
}

export class ContentLoader {
  readonly base: string;
  manifest!: Manifest;
  /** Bytes transferred so far, for the first-view budget and stats. */
  bytesLoaded = 0;

  private indexCache = new Map<Language, Promise<StartupIndex>>();
  private parts = new Map<string, Promise<PartFile | undefined>>();
  private partData = new Map<string, PartFile>();
  private queue: Request[] = [];
  private active = 0;

  constructor(base = 'data/') {
    this.base = base;
  }

  async init(): Promise<Manifest> {
    const res = await fetch(`${this.base}manifest.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Manifest not found (${res.status})`);
    this.manifest = (await res.json()) as Manifest;
    return this.manifest;
  }

  index(language: Language): Promise<StartupIndex> {
    let p = this.indexCache.get(language);
    if (!p) {
      p = this.fetchJson<StartupIndex>(this.manifest.index[language]);
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
    return new Promise((resolve) => {
      const controller = new AbortController();
      signal?.addEventListener('abort', () => controller.abort());
      this.queue.push({ url: this.base + file, priority, controller, resolve });
      this.pump();
    });
  }

  /** Changes priorities and drops requests for tiles no longer wanted. */
  reprioritise(priorityOf: (url: string) => number | undefined): void {
    this.queue = this.queue.filter((r) => {
      const p = priorityOf(r.url);
      if (p === undefined) {
        r.controller.abort();
        r.resolve(undefined);
        return false;
      }
      r.priority = p;
      return true;
    });
  }

  get pending(): number {
    return this.queue.length + this.active;
  }

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
      fetch(req.url, { signal: req.controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error(`${res.status} ${req.url}`);
          const buf = await res.arrayBuffer();
          this.bytesLoaded += buf.byteLength;
          req.resolve(buf);
        })
        .catch(() => req.resolve(undefined))
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }

  private async fetchJson<T>(file: string): Promise<T> {
    const res = await fetch(this.base + file);
    if (!res.ok) throw new Error(`${res.status} ${file}`);
    const text = await res.text();
    this.bytesLoaded += text.length;
    return JSON.parse(text) as T;
  }
}
