import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTICES_FILE, buildNotices } from './notices.ts';

const ROOT = new URL('../../..', import.meta.url).pathname;

describe('third-party notices', () => {
  it('allows the licence of every runtime dependency', () => {
    expect(buildNotices(ROOT).disallowed).toEqual([]);
  });

  it('is up to date (run npm run notices)', () => {
    expect(readFileSync(join(ROOT, NOTICES_FILE), 'utf8')).toBe(buildNotices(ROOT).text);
  });
});
