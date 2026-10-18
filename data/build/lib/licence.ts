// Data licence policy (spec section 13).

export type LicenceVerdict = 'allowed' | 'needs-approval' | 'forbidden';

export function licenceVerdict(spdx: string | undefined): LicenceVerdict {
  if (!spdx) return 'forbidden';
  const id = spdx.trim();
  if (/-NC\b|-NC-|-ND\b|-ND-/i.test(id)) return 'forbidden';
  if (/^CC-BY-SA-|^ODbL-|^GPL-|^LGPL-|^AGPL-/i.test(id)) return 'needs-approval';
  if (
    id === 'CC0-1.0' ||
    /^CC-BY-\d/.test(id) ||
    id === 'ODC-By-1.0' ||
    id === 'LicenseRef-Public-Domain' ||
    id === 'LicenseRef-US-Government-Work'
  )
    return 'allowed';
  return 'forbidden';
}

export interface SourceEntry {
  id: string;
  title: string;
  role: string;
  licence: string;
  citation: string;
  url: string;
  /** Name and date of Yang's approval, for licences that need it. */
  approvedBy?: string;
  download?: { url: string; files?: string[]; archive?: string; note?: string };
  files: { path: string; sha256: string; bytes: number }[];
}

export function checkLicences(sources: SourceEntry[]): string[] {
  const errors: string[] = [];
  for (const s of sources) {
    const verdict = licenceVerdict(s.licence);
    if (verdict === 'forbidden')
      errors.push(`${s.id}: licence "${s.licence}" is not allowed (spec section 13)`);
    if (verdict === 'needs-approval' && !s.approvedBy)
      errors.push(`${s.id}: licence "${s.licence}" needs Yang's approval (spec section 13)`);
  }
  return errors;
}
