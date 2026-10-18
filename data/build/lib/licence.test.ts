import { describe, expect, it } from 'vitest';
import { checkLicences, licenceVerdict } from './licence.ts';

describe('licence policy', () => {
  it('allows public domain and attribution licences', () => {
    for (const id of [
      'CC0-1.0',
      'CC-BY-4.0',
      'CC-BY-3.0',
      'ODC-By-1.0',
      'LicenseRef-Public-Domain',
    ])
      expect(licenceVerdict(id)).toBe('allowed');
  });

  it('asks for approval of share-alike and copyleft licences', () => {
    for (const id of ['CC-BY-SA-4.0', 'ODbL-1.0', 'GPL-3.0-only'])
      expect(licenceVerdict(id)).toBe('needs-approval');
  });

  it('forbids non-commercial, no-derivatives and missing licences', () => {
    for (const id of ['CC-BY-NC-4.0', 'CC-BY-ND-4.0', 'CC-BY-NC-SA-4.0', '', 'Proprietary'])
      expect(licenceVerdict(id)).toBe('forbidden');
  });

  it('reports sources that break the policy', () => {
    const base = { title: '', role: '', citation: '', url: '', files: [] };
    expect(
      checkLicences([
        { ...base, id: 'a', licence: 'CC-BY-4.0' },
        { ...base, id: 'b', licence: 'GPL-3.0-only' },
        { ...base, id: 'c', licence: 'GPL-3.0-only', approvedBy: 'Yang, 2026-11-01' },
        { ...base, id: 'd', licence: 'CC-BY-NC-4.0' },
      ]),
    ).toHaveLength(2);
  });
});
