import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import { formatMessage } from './messages.ts';

describe('message files', () => {
  it('have the same keys in English and German', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('have no empty messages and parse in both languages', () => {
    for (const [lang, messages] of [
      ['en', en],
      ['de', de],
    ] as const) {
      for (const [key, value] of Object.entries(messages)) {
        expect(value.trim(), `${lang} ${key}`).not.toBe('');
        expect(() => formatMessage(value, {}, lang)).not.toThrow();
      }
    }
  });

  it('are the only place viewer-facing text lives in components', () => {
    // JSX text containing letters must come from the message files.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith('.tsx')) {
          const src = readFileSync(path, 'utf8');
          for (const m of src.matchAll(
            /(?<!=)>\s*([^<>{}\n]*[A-Za-zÄÖÜäöüß]{2,}[^<>{}\n]*)\s*</g,
          )) {
            offenders.push(`${path}: "${m[1]!.trim()}"`);
          }
          for (const m of src.matchAll(
            /\b(?:title|aria-label|placeholder|alt)="([^"]*[A-Za-z]{2,}[^"]*)"/g,
          )) {
            offenders.push(`${path}: ${m[0]}`);
          }
        }
      }
    };
    walk(join(__dirname, '..'));
    expect(offenders).toEqual([]);
  });
});
