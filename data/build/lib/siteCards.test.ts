import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSiteCards } from './siteCards.ts';

const EN = `## en

# Cave

**Made:** long ago.

**Discovered:** in 1994.

### What was found

Paintings.

### How it looked

Dark and red.

### What it was for

Unknown.
`;
const DE = `## de

# Höhle

**Entstanden:** vor langer Zeit.

**Entdeckt:** 1994.

### Was man fand

Bilder.

### So sah es aus

Dunkel und rot.

### Wozu es diente

Unbekannt.
`;

function fixture(records: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'site-cards-'));
  writeFileSync(join(dir, 'sources.yaml'), 'src:\n  title: A source\n');
  mkdirSync(join(dir, 'site-cards'));
  for (const [name, text] of Object.entries(records))
    writeFileSync(join(dir, 'site-cards', name), text);
  return dir;
}

const record = (body: string) =>
  `---\nid: cave\nkind: site-card\nsources:\n  - ref: src\n---\n\n${body}`;

describe('buildSiteCards (humankind.md section 8.3)', () => {
  it('compiles a card per anchor in both languages', () => {
    const out = buildSiteCards({
      curated: fixture({ 'cave.md': record(`${EN}\n${DE}`) }),
      anchors: new Set(['cave']),
    });
    expect(out.errors).toEqual([]);
    expect(out.cards[0]!.text.de.title).toBe('Höhle');
    expect(out.cards[0]!.text.en.body).toContain('### How it looked');
  });

  it('fails on an anchor without a card', () => {
    const out = buildSiteCards({
      curated: fixture({ 'cave.md': record(`${EN}\n${DE}`) }),
      anchors: new Set(['cave', 'other']),
    });
    expect(out.errors.join()).toContain('missing card for anchor "other"');
  });

  it('fails on a missing sub-heading', () => {
    const out = buildSiteCards({
      curated: fixture({
        'cave.md': record(`${EN.replace('### What it was for', '### Use')}\n${DE}`),
      }),
      anchors: new Set(['cave']),
    });
    expect(out.errors.join()).toContain('What it was for');
  });

  it('fails on a missing language', () => {
    const out = buildSiteCards({
      curated: fixture({ 'cave.md': record(EN) }),
      anchors: new Set(['cave']),
    });
    expect(out.errors.join()).toContain('missing language section "## de"');
  });

  it('compiles an event card of an arrival and fails on an arrival without one', () => {
    const en = EN.replace('**Made:**', '**When:**')
      .replace('**Discovered:**', '**Where:**')
      .replace('What was found', 'What we know')
      .replace('How it looked', 'How it may have looked')
      .replace('What it was for', 'What is debated');
    const de = DE.replace('**Entstanden:**', '**Wann:**')
      .replace('**Entdeckt:**', '**Wo:**')
      .replace('Was man fand', 'Was man weiß')
      .replace('So sah es aus', 'Wie es ausgesehen haben könnte')
      .replace('Wozu es diente', 'Was umstritten ist');
    const event = `---\nid: cave\nkind: event-card\nsources:\n  - ref: src\n---\n\n${en}\n${de}`;
    const ok = buildSiteCards({
      curated: fixture({ 'cave.md': event }),
      anchors: new Set(),
      arrivals: new Set(['cave']),
    });
    expect(ok.errors).toEqual([]);
    expect(ok.cards[0]!.text.en.body).toContain('### What we know');
    const missing = buildSiteCards({
      curated: fixture({ 'cave.md': event }),
      anchors: new Set(),
      arrivals: new Set(['cave', 'far']),
    });
    expect(missing.errors.join()).toContain('missing event card for arrival "far"');
  });
});
