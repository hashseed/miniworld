// The culture profiles of milestone 2 (spec milestone 2, section 4), until
// culture records exist. One list for the models, the card build and the
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
  // Peopling the world (peopling.md section 5.1).
  'west-asia-hunter',
  'east-asia-hunter',
  'first-americans',
  // Farmers and herders of the Neolithic (docs/spec/neolithic/people-profiles.md).
  'pre-pottery-neolithic-levant',
  'anatolian-farmer',
  'lbk-farmer',
  'indus-farmer',
  'nile-neolithic',
  'yellow-river-millet-farmer',
  'yangtze-rice-farmer',
  'mesoamerican-farmer',
  'andean-farmer',
  'new-guinea-highland-farmer',
] as const;
export type Profile = (typeof PROFILES)[number];
