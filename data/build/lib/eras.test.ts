import { describe, expect, it } from 'vitest';
import { dayOfYearStart } from '../../../app/src/time/calendar.ts';
import { erasForLanguage, validateEras, type CuratedEra, type CuratedEras } from './eras.ts';

const START = dayOfYearStart(-9999);
const CUTOFF = dayOfYearStart(2025);
const era = (over: Partial<CuratedEra> = {}): CuratedEra => ({
  id: 'rome',
  lane: 'europe',
  from: { year: 753, era: 'BCE', approximate: true },
  to: { year: 476, era: 'CE', approximate: false },
  color: '#aa3322',
  label: { en: 'Roman world', de: 'Römische Welt' },
  source: { title: 'A history', publisher: 'A press' },
  ...over,
});
const data = (eras: CuratedEra[]): CuratedEras => ({
  lanes: [{ id: 'europe', label: { en: 'Europe', de: 'Europa' } }],
  eras,
});

describe('eras', () => {
  it('accepts a valid set', () => {
    const all = [era(), era({ id: 'all', from: { start: true }, to: { today: true } })];
    expect(validateEras(data(all), START, CUTOFF)).toEqual([]);
  });

  it('reports each kind of error', () => {
    const bad = data([
      era(),
      era(),
      era({ id: 'lost', lane: 'mars' }),
      era({ id: 'mute', label: { en: 'Mute', de: ' ' } }),
      era({ id: 'nosource', source: { title: '', publisher: 'A press' } }),
      era({ id: 'grey', color: 'grey' }),
      era({ id: 'back', to: { year: 800, era: 'BCE', approximate: false } }),
      era({ id: 'early', from: { year: 20000, era: 'BCE', approximate: true } }),
    ]);
    bad.lanes.push({ id: 'asia', label: { en: 'Asia', de: '' } });
    expect(validateEras(bad, START, CUTOFF)).toEqual([
      'lane asia: missing de label',
      'era rome: duplicate id',
      'era lost: unknown lane mars',
      'era mute: missing de label',
      'era nosource: missing source',
      'era grey: bad colour',
      'era back: ends before it starts',
      'era early: outside the timeline',
    ]);
  });

  it('picks the labels of one language and turns dates into days', () => {
    const all = data([era(), era({ id: 'all', from: { start: true }, to: { today: true } })]);
    const de = erasForLanguage(all, 'de', START, CUTOFF);
    expect(de.lanes).toEqual([{ id: 'europe', label: 'Europa' }]);
    expect(de.eras[0]).toEqual({
      id: 'rome',
      lane: 'europe',
      fromDay: dayOfYearStart(-752),
      toDay: dayOfYearStart(476),
      fromApproximate: true,
      toApproximate: false,
      color: '#aa3322',
      label: 'Römische Welt',
    });
    expect(de.eras[1]).toMatchObject({ fromDay: START, toDay: CUTOFF, fromApproximate: false });
    expect(erasForLanguage(all, 'en', START, CUTOFF).eras[0]!.label).toBe('Roman world');
  });
});
