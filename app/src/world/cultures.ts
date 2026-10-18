// The culture profiles of milestone 2 (spec milestone 2, section 4), until
// culture records exist. One list for the models, the vignette build and the
// review sheets.

export const PROFILES = [
  'african-stone-age',
  'neanderthal',
  'coastal-asia-hunter',
  'first-australians',
  'ice-age-hunter',
  'steppe-beringia-hunter',
  'natufian',
  'old-kingdom-egyptian',
] as const;
export type Profile = (typeof PROFILES)[number];
