import { describe, expect, it } from 'vitest';
import { parseGpml } from './gpml.ts';
import { simplifyLine } from './line.ts';
import { parseRot } from './rot.ts';

const RIDGE = `<gml:featureMember>
  <gpml:MidOceanRidge>
    <gml:name>Aden Ridge</gml:name>
    <gml:validTime><gml:TimePeriod>
      <gml:begin><gml:TimeInstant><gml:timePosition gml:frame="x">5</gml:timePosition></gml:TimeInstant></gml:begin>
      <gml:end><gml:TimeInstant><gml:timePosition gml:frame="x">0</gml:timePosition></gml:TimeInstant></gml:end>
    </gml:TimePeriod></gml:validTime>
    <gpml:reconstructionPlateId><gpml:ConstantValue><gpml:value>593</gpml:value></gpml:ConstantValue></gpml:reconstructionPlateId>
    <gpml:geometryImportTime><gml:TimeInstant><gml:timePosition gml:frame="x">5</gml:timePosition></gml:TimeInstant></gpml:geometryImportTime>
    <gpml:reconstructionMethod>HalfStageRotationVersion3</gpml:reconstructionMethod>
    <gpml:leftPlate>503</gpml:leftPlate>
    <gpml:rightPlate>709</gpml:rightPlate>
    <gpml:centerLineOf><gpml:ConstantValue><gpml:value><gml:OrientableCurve><gml:baseCurve><gml:LineString>
      <gml:posList gml:dimension="2">12.5 45.1 12.8 46.0 13.0 47.5</gml:posList>
    </gml:LineString></gml:baseCurve></gml:OrientableCurve></gpml:value></gpml:ConstantValue></gpml:centerLineOf>
  </gpml:MidOceanRidge>
</gml:featureMember>`;

const LAND = `<gml:featureMember>
  <gpml:ClosedContinentalBoundary>
    <gml:name>Piece</gml:name>
    <gml:validTime><gml:TimePeriod>
      <gml:begin><gml:TimeInstant><gml:timePosition gml:frame="x">410</gml:timePosition></gml:TimeInstant></gml:begin>
      <gml:end><gml:TimeInstant><gml:timePosition gml:frame="x">http://gplates.org/times/distantFuture</gml:timePosition></gml:TimeInstant></gml:end>
    </gml:TimePeriod></gml:validTime>
    <gpml:reconstructionPlateId><gpml:ConstantValue><gpml:value>451</gpml:value></gpml:ConstantValue></gpml:reconstructionPlateId>
    <gpml:boundary><gpml:ConstantValue><gpml:value><gml:Polygon>
      <gml:exterior><gml:LinearRing><gml:posList>0 0 0 10 10 10 10 0 0 0</gml:posList></gml:LinearRing></gml:exterior>
      <gml:interior><gml:LinearRing><gml:posList>4 4 4 6 6 6 6 4 4 4</gml:posList></gml:LinearRing></gml:interior>
    </gml:Polygon></gpml:value></gpml:ConstantValue></gpml:boundary>
  </gpml:ClosedContinentalBoundary>
</gml:featureMember>`;

describe('parseGpml', () => {
  it('reads a half-stage ridge with its plates, times and line', () => {
    const [f] = parseGpml(`<root>${RIDGE}</root>`);
    expect(f).toMatchObject({
      type: 'MidOceanRidge',
      name: 'Aden Ridge',
      plateId: 593,
      begin: 5,
      end: 0,
      leftPlate: 503,
      rightPlate: 709,
      importTime: 5,
      polygon: false,
    });
    expect(f!.method).toMatch(/^HalfStage/);
    expect(f!.rings).toEqual([[12.5, 45.1, 12.8, 46.0, 13.0, 47.5]]);
  });

  it('reads a polygon with a hole and an open end time', () => {
    const [f] = parseGpml(`<root>${LAND}</root>`);
    expect(f).toMatchObject({
      type: 'ClosedContinentalBoundary',
      plateId: 451,
      begin: 410,
      end: 0,
      polygon: true,
      method: 'ByPlateId',
    });
    expect(f!.rings).toHaveLength(2);
    expect(f!.rings[1]).toEqual([4, 4, 4, 6, 6, 6, 6, 4, 4, 4]);
  });

  it('skips features without a line or polygon', () => {
    expect(
      parseGpml(
        '<gml:featureMember><gpml:Fault><gml:name>x</gml:name></gpml:Fault></gml:featureMember>',
      ),
    ).toEqual([]);
  });
});

describe('parseRot', () => {
  it('reads rows and ignores comments and bad lines', () => {
    const rows = parseRot(`
001  0.0   90.0    0.0    0.0  000 ! nan
101 10.9   81.0   22.9    2.84  714 ! NAM-NWA @REF Mueller_1999
junk line
101 20.1   80.6   24.5    5.53  714 !
`);
    expect(rows).toEqual([
      { plate: 1, age: 0, lat: 90, lon: 0, angle: 0, fixed: 0 },
      { plate: 101, age: 10.9, lat: 81, lon: 22.9, angle: 2.84, fixed: 714 },
      { plate: 101, age: 20.1, lat: 80.6, lon: 24.5, angle: 5.53, fixed: 714 },
    ]);
  });
});

describe('simplifyLine', () => {
  it('drops points within the tolerance and keeps the ends', () => {
    const line = simplifyLine(
      [
        [0, 0],
        [0.001, 1],
        [0, 2],
        [0.5, 3],
        [0, 4],
      ],
      0.05,
      false,
    );
    expect(line[0]).toEqual([0, 0]);
    expect(line[line.length - 1]).toEqual([0, 4]);
    expect(line).toContainEqual([0.5, 3]);
    expect(line).not.toContainEqual([0.001, 1]);
  });

  it('simplifies across the antimeridian as one piece', () => {
    const line = simplifyLine(
      [
        [0, 179],
        [0, 179.5],
        [0, -179.5],
        [0, -179],
      ],
      0.01,
      false,
    );
    expect(line).toEqual([
      [0, 179],
      [0, -179],
    ]);
  });

  it('keeps a ring at least a triangle', () => {
    const ring = simplifyLine(
      [
        [0, 0],
        [0, 10],
        [10, 10],
        [10, 0],
      ],
      100,
      true,
    );
    expect(ring.length).toBeGreaterThanOrEqual(3);
  });
});
