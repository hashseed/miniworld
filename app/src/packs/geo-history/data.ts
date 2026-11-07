// The data the geo-history app loads (built by data/packs/geo-history/build/).

export interface Localised {
  en: string;
  de: string;
}

export interface Period {
  id: string;
  from: number;
  to: number;
  colour: string;
  name: Localised;
}

export interface Supercontinent extends Period {
  approx: boolean;
  sources: string[];
}

export type Look = { centre: true } | { follow: { plate: number; lat: number; lon: number } };

export interface Moment {
  id: string;
  from: number;
  to: number;
  age: number;
  approx: boolean;
  look: Look;
  sources: string[];
  title: Localised;
  text: Localised;
}

export interface Boundary {
  kind: 'ridge' | 'subduction' | 'transform';
  plate: number;
  begin: number;
  end: number;
  left?: number;
  right?: number;
  at?: number;
  side?: 'L' | 'R' | 'U';
  lines: number[][];
}

export interface GeoData {
  version: string;
  rotations: number[][];
  land: { plate: number; begin: number; end: number; rings: number[][] }[];
  boundaries: Boundary[];
  coasts: { plate: number; line: number[] }[];
  periods: Period[];
  supercontinents: Supercontinent[];
  moments: Moment[];
  climate: { lat: number; colour: string }[];
  credits: { id: string; citation: string; licence: string }[];
}

export async function loadGeoData(base = 'data/'): Promise<GeoData> {
  const manifest = (await (await fetch(`${base}manifest.json`)).json()) as { geo: string };
  const res = await fetch(`${base}${manifest.geo}`);
  if (!res.ok) throw new Error(`${manifest.geo}: HTTP ${res.status}`);
  return (await res.json()) as GeoData;
}
