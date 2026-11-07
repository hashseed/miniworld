// A small reader for the GPlates GPML files of the plate model (geo-history.md,
// section 4). GPML is regular XML; the features are cut out with plain string
// searches, which is enough for these files and needs no XML library.

export interface GpmlFeature {
  /** Element name of the feature, such as MidOceanRidge or ClosedContinentalBoundary. */
  type: string;
  name: string;
  plateId: number;
  /** Oldest age (Ma) at which the feature exists; Infinity when it has no start. */
  begin: number;
  /** Youngest age (Ma) at which the feature exists; 0 when it lasts to today. */
  end: number;
  /** How the geometry is moved: ByPlateId (the default) or HalfStageRotation. */
  method: string;
  leftPlate: number;
  rightPlate: number;
  /** Age (Ma) at which the geometry is positioned. */
  importTime: number;
  /** Subduction polarity: Left, Right or Unknown. */
  polarity: string;
  /** Polygon rings or lines as flat [lat, lon, lat, lon, ...]; the first ring of a polygon is its exterior. */
  rings: number[][];
  /** The geometry is a polygon (closed rings) and not a line. */
  polygon: boolean;
}

function time(text: string): number {
  if (text.endsWith('distantFuture')) return 0;
  if (text.endsWith('distantPast')) return Infinity;
  return Number(text);
}

function firstValue(block: string, tag: string): string | undefined {
  const i = block.indexOf(`<gpml:${tag}>`);
  if (i < 0) return undefined;
  const j = block.indexOf('</gpml:' + tag + '>', i);
  const inner = block.slice(i, j);
  const v = /<gpml:value>\s*([^<\s][^<]*?)\s*<\/gpml:value>/.exec(inner);
  return v?.[1] ?? /<gpml:(?:leftPlate|rightPlate)>\s*(\d+)/.exec(inner)?.[1];
}

function simpleValue(block: string, tag: string): string | undefined {
  return new RegExp(`<gpml:${tag}>\\s*([^<\\s][^<]*?)\\s*</gpml:${tag}>`).exec(block)?.[1];
}

function positions(list: string): number[] {
  const out: number[] = [];
  for (const t of list.trim().split(/\s+/)) out.push(Number(t));
  return out;
}

function validTime(block: string): [number, number] {
  const i = block.indexOf('<gml:validTime>');
  if (i < 0) return [Infinity, 0];
  const j = block.indexOf('</gml:validTime>', i);
  const span = block.slice(i, j);
  const b = /<gml:begin>[\s\S]*?<gml:timePosition[^>]*>([^<]*)</.exec(span);
  const e = /<gml:end>[\s\S]*?<gml:timePosition[^>]*>([^<]*)</.exec(span);
  return [b ? time(b[1]!.trim()) : Infinity, e ? time(e[1]!.trim()) : 0];
}

/** Every feature of a GPML document, with its geometry; features without a line or polygon are skipped. */
export function parseGpml(xml: string): GpmlFeature[] {
  const features: GpmlFeature[] = [];
  for (const block of xml.split('<gml:featureMember>').slice(1)) {
    const type = /^\s*<gpml:(\w+)>/.exec(block)?.[1];
    if (!type) continue;
    const polygon = block.includes('<gml:Polygon');
    const rings: number[][] = [];
    if (polygon) {
      for (const m of block.matchAll(
        /<gml:(?:exterior|interior)>[\s\S]*?<gml:posList[^>]*>([^<]*)</g,
      ))
        rings.push(positions(m[1]!));
    } else {
      for (const m of block.matchAll(/<gml:LineString>\s*<gml:posList[^>]*>([^<]*)</g))
        rings.push(positions(m[1]!));
    }
    if (rings.length === 0) continue;
    const [begin, end] = validTime(block);
    features.push({
      type,
      name: /<gml:name>([^<]*)</.exec(block)?.[1]?.trim() ?? '',
      plateId: Number(firstValue(block, 'reconstructionPlateId') ?? 0),
      begin,
      end,
      method: simpleValue(block, 'reconstructionMethod') ?? 'ByPlateId',
      leftPlate: Number(simpleValue(block, 'leftPlate') ?? 0),
      rightPlate: Number(simpleValue(block, 'rightPlate') ?? 0),
      importTime: Number(
        /<gpml:geometryImportTime>[\s\S]*?<gml:timePosition[^>]*>([^<]*)</.exec(block)?.[1] ?? 0,
      ),
      polarity: firstValue(block, 'subductionPolarity') ?? 'Unknown',
      rings,
      polygon,
    });
  }
  return features;
}
