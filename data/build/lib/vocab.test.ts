import { describe, expect, it } from 'vitest';
import { VERBS } from '../../../app/src/world/vignette.ts';
import { RolesSchema } from '../../schema/vocab.ts';
import { parseVocab, repoVocab } from './vocab.ts';

describe('vocabularies', () => {
  it('reads every vocabulary file of the repository', () => {
    const v = repoVocab();
    expect(v.roles['hunter']).toMatchObject({ man: true, tool: 'spear' });
    expect(v.animals['mammoth']!.de).toBe('Wollhaarmammut');
    expect(Object.keys(v.icons)).toContain('spear');
  });

  it('lists exactly the actions the vignette player implements', () => {
    expect(Object.keys(repoVocab().actions).sort()).toEqual([...VERBS].sort());
  });

  it('reports each entry that does not match its schema', () => {
    const errors: string[] = [];
    const text = [
      'hunter: { en: Hunter, de: { female: Jägerin, male: Jäger }, man: yes }',
      'Gatherer: { en: Gatherer, de: { female: Sammlerin, male: Sammler } }',
      'scribe: { en: Scribe, de: Schreiber }',
      'cook: { en: Cook, de: { female: Köchin, male: Koch }, colour: red }',
    ].join('\n');
    expect(parseVocab('vocab/roles.yaml', text, RolesSchema, errors)).toBeUndefined();
    expect(errors.join('\n')).toMatch(/hunter\.man/);
    expect(errors.join('\n')).toMatch(/Gatherer/);
    expect(errors.join('\n')).toMatch(/scribe\.de/);
    expect(errors.join('\n')).toMatch(/cook/);
    expect(errors.every((e) => e.startsWith('vocab/roles.yaml: '))).toBe(true);
  });
});
