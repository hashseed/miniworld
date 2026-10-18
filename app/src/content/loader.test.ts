import { describe, expect, it } from 'vitest';
import { ContentLoader, RetryLaterError } from './loader.ts';
import type { Manifest } from './types.ts';

/** A fake server: files by URL, with a status per URL, answering when told to. */
class FakeServer {
  files = new Map<string, string>();
  status = new Map<string, number>();
  offline = false;
  log: string[] = [];
  private waiting: (() => void)[] = [];
  /** When true, requests wait until flush(). */
  hold = false;

  fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    this.log.push(url);
    return new Promise((resolve, reject) => {
      const answer = () => {
        if (init?.signal?.aborted) return reject(new DOMException('aborted', 'AbortError'));
        if (this.offline) return reject(new TypeError('offline'));
        const status = this.status.get(url) ?? (this.files.has(url) ? 200 : 404);
        resolve(new Response(status === 200 ? this.files.get(url)! : 'nope', { status }));
      };
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      );
      if (this.hold) this.waiting.push(answer);
      else answer();
    });
  };

  async flush(): Promise<void> {
    const w = this.waiting.splice(0);
    for (const answer of w) answer();
    await settle();
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0));

function setup(): { server: FakeServer; loader: ContentLoader; clock: { t: number } } {
  const server = new FakeServer();
  const clock = { t: 0 };
  const loader = new ContentLoader('d/', { fetch: server.fetch, now: () => clock.t });
  loader.manifest = { index: { en: 'en.json', de: 'de.json' } } as unknown as Manifest;
  return { server, loader, clock };
}

describe('content loader', () => {
  it('runs at most six requests at once, then the most urgent first', async () => {
    const { server, loader } = setup();
    server.hold = true;
    for (let i = 0; i < 10; i++) server.files.set(`d/c${i}`, `${i}`);
    const done: number[] = [];
    for (let i = 0; i < 10; i++)
      void loader.fetchChunk(`c${i}`, 10 - i).then((b) => b && done.push(i));
    expect(server.log).toEqual(['d/c0', 'd/c1', 'd/c2', 'd/c3', 'd/c4', 'd/c5']);
    expect(loader.pending).toBe(10);
    await server.flush();
    expect(server.log.slice(6)).toEqual(['d/c9', 'd/c8', 'd/c7', 'd/c6']);
    await server.flush();
    expect(done.sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(loader.pending).toBe(0);
  });

  it('takes new priorities for waiting requests', async () => {
    const { server, loader } = setup();
    server.hold = true;
    for (let i = 0; i < 8; i++) server.files.set(`d/c${i}`, `${i}`);
    for (let i = 0; i < 8; i++) void loader.fetchChunk(`c${i}`, i);
    loader.setPriority('c7', -1);
    await server.flush();
    expect(server.log[6]).toBe('d/c7');
  });

  it('drops a cancelled request without counting it as a failure', async () => {
    const { server, loader } = setup();
    server.hold = true;
    server.files.set('d/a', 'a');
    const controller = new AbortController();
    const p = loader.fetchChunk('a', 0, controller.signal);
    controller.abort();
    expect(await p).toBeUndefined();
    server.hold = false;
    expect(await loader.fetchChunk('a', 0)).toBeInstanceOf(ArrayBuffer);
  });

  it('waits longer after each failure, up to a minute', async () => {
    const { server, loader, clock } = setup();
    server.offline = true;
    expect(await loader.fetchChunk('a', 0)).toBeUndefined();
    expect(server.log).toHaveLength(1);
    // Not asked again before its retry time.
    clock.t = 999;
    expect(await loader.fetchChunk('a', 0)).toBeUndefined();
    expect(server.log).toHaveLength(1);
    let wait = 1000;
    for (let failures = 1; failures < 10; failures++) {
      clock.t += wait;
      await loader.fetchChunk('a', 0);
      expect(server.log).toHaveLength(failures + 1);
      wait = Math.min(60_000, wait * 2);
      clock.t += wait - 1;
      await loader.fetchChunk('a', 0);
      expect(server.log).toHaveLength(failures + 1);
      clock.t += 1 - wait;
    }
    // Back online: loading resumes at the next retry time, and the count resets.
    server.offline = false;
    server.files.set('d/a', 'a');
    clock.t += wait;
    expect(await loader.fetchChunk('a', 0)).toBeInstanceOf(ArrayBuffer);
  });

  it('never asks again for a file that does not exist', async () => {
    const { server, loader, clock } = setup();
    expect(await loader.fetchChunk('gone', 0)).toBeUndefined();
    clock.t = 1e9;
    expect(await loader.fetchChunk('gone', 0)).toBeUndefined();
    await expect(loader.json('gone')).rejects.toBeInstanceOf(RetryLaterError);
    expect(server.log).toEqual(['d/gone']);
  });

  it('retries a failed index on the next call', async () => {
    const { server, loader, clock } = setup();
    server.status.set('d/de.json', 503);
    await expect(loader.index('de')).rejects.toThrow('503');
    // Within the pause the loader does not ask the server at all.
    await expect(loader.index('de')).rejects.toBeInstanceOf(RetryLaterError);
    server.status.delete('d/de.json');
    server.files.set('d/de.json', '{"lanes":[]}');
    clock.t = 1000;
    await expect(loader.index('de')).resolves.toEqual({ lanes: [] });
    expect(server.log).toEqual(['d/de.json', 'd/de.json']);
  });

  it('counts the bytes it loads', async () => {
    const { server, loader } = setup();
    server.files.set('d/a', 'abcd');
    server.files.set('d/b.json', '[1]');
    await loader.fetchChunk('a', 0);
    await loader.json('b.json');
    expect(loader.bytesLoaded).toBe(7);
  });
});
