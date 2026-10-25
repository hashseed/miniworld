// Review sheets (spec milestone 2, section 13.3): models drawn in the app's
// cel-shaded clay look for Yang to approve. Development tool only; the
// labels are for the reviewer, not viewer-facing text.

import * as THREE from 'three';
import { cameraLight } from '../../app/src/globe/sky.ts';
import { ModelBuilder, blob, celMaterial, lightUniforms, type Model } from './kit.ts';
import { PROFILES, buildPerson, posePerson, type Kind, type Pose } from './people.ts';
import {
  SHELTERS,
  buildShelter,
  buildHearth,
  buildSteps,
  CAMP_SHELTER,
  setBuilt,
} from './shelters.ts';
import { ANIMALS, PREHISTORIC_ANIMALS, buildAnimal, type AnimalId } from './animals.ts';
import { CROPS, STAGES, cropGeometry } from './crops.ts';
import { buildGobekliTepe } from './gobekli.ts';
import { TOOL_PROPS } from './neolithicTools.ts';
import { WILD_ANIMALS } from './wildAnimals.ts';
import { EXTINCT_ANIMALS } from './extinctAnimals.ts';
import {
  BLEND_SECONDS,
  animateAnimal,
  walkPeriod,
  animatePerson,
  blendPerson,
  gaitSpeed,
  type Clip,
} from './clips.ts';
// Every model that loads with its culture, so all of them can be built here.
import './allCultureModels.ts';

const params = new URLSearchParams(location.search);
const sheetName = params.get('sheet') ?? 'people';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0xfbe3d4);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 500);
const labels: { text: string; at: THREE.Vector3 }[] = [];
let triangles = 0;
const info = { text: '' };
const tileLabels: { text: string; x: number; y: number }[] = [];
/** Set by sheets that move: poses the scene at a time in seconds (`window.setFrame`). */
let update: ((seconds: number) => void) | undefined;
/** Set by sheets that draw their own tiles instead of the one default camera. */
let customRender: (() => void) | undefined;

function place(m: Model, x: number, z: number, turn = 0): Model {
  m.object.position.set(x, 0, z);
  m.object.rotation.y = turn;
  scene.add(m.object);
  triangles += m.triangles;
  return m;
}

/** A clay ground plate. */
function ground(x: number, z: number, r: number, colour = '#a9b86a'): void {
  const mb = new ModelBuilder([], 0.6);
  mb.add(blob([0, -0.08, 0], [r, 0.12, r * 0.8], 20), colour);
  const m = mb.build('ground');
  m.object.position.set(x, 0, z);
  scene.add(m.object);
}

const GROUND: Record<string, string> = {
  'african-stone-age': '#c9b56c',
  neanderthal: '#9fae6e',
  'coastal-asia-hunter': '#d9c99a',
  'first-australians': '#c98a55',
  'ice-age-hunter': '#c7cfa2',
  'steppe-beringia-hunter': '#dfe4dc',
  natufian: '#b8b06e',
  'old-kingdom-egyptian': '#e0c58e',
  'west-asia-hunter': '#c8b37c',
  'east-asia-hunter': '#b9c08e',
  'first-americans': '#a9b86a',
  'pre-pottery-neolithic-levant': '#c4b87a',
  'anatolian-farmer': '#c9b87e',
  'lbk-farmer': '#a9b872',
  'indus-farmer': '#cdbb82',
  'nile-neolithic': '#d6c58e',
  'yellow-river-millet-farmer': '#c8b87a',
  'yangtze-rice-farmer': '#9fb872',
  'mesoamerican-farmer': '#b2b46c',
  'andean-farmer': '#c2b08a',
  'new-guinea-highland-farmer': '#8fb068',
};

const KINDS: Kind[] = ['man', 'woman', 'child'];

function peopleSheet(): void {
  const poses: Pose[] = ['stand', 'point', 'carry'];
  // The Neolithic profiles have their own sheet (docs/spec/neolithic/people-profiles.md).
  const first = PROFILES.indexOf('pre-pottery-neolithic-levant');
  const shown =
    params.get('set') === 'neolithic' ? PROFILES.slice(first) : PROFILES.slice(0, first);
  shown.forEach((p, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = (col - 1.5) * 3.4 + (row ? 1.7 : 0);
    const z = row * 4.2 - 2.2;
    ground(x, z, 1.55, GROUND[p]);
    KINDS.forEach((k, j) => {
      const m = buildPerson({ profile: p, kind: k, variant: i + j });
      posePerson(m, poses[j]!);
      place(m, x + (j - 1) * 0.85, z + (j === 1 ? -0.3 : 0.1), (j - 1) * -0.35);
    });
    labels.push({ text: p, at: new THREE.Vector3(x, 2.35, z - 0.3) });
  });
  if (params.get('set') === 'neolithic') {
    // Three rows of four: pull back and aim at the middle of the block.
    camera.position.set(0.85, 12, 21);
    camera.lookAt(0.85, 0.2, 1.8);
  } else {
    camera.position.set(0, 7.5, 15.5);
    camera.lookAt(0, 0.2, -0.2);
  }
}

function turnaroundSheet(): void {
  const profile = (params.get('profile') ?? 'ice-age-hunter') as (typeof PROFILES)[number];
  ground(0, 0, 7.6, GROUND[profile]);
  KINDS.forEach((k, j) => {
    for (let a = 0; a < 4; a++) {
      const m = buildPerson({ profile, kind: k, variant: j });
      posePerson(m, 'stand');
      place(m, (j - 1) * 4.6 + (a - 1.5) * 1.05, 0, (a * Math.PI) / 2);
    }
  });
  labels.push({
    text: `${profile}: front, left, back, right`,
    at: new THREE.Vector3(0, -0.1, 2.0),
  });
  camera.position.set(0, 3.0, 14.5);
  camera.lookAt(0, 0.95, 0);
}

function campSheet(): void {
  const profile = (params.get('profile') ?? 'ice-age-hunter') as (typeof PROFILES)[number];
  ground(0, 0, 5.5, GROUND[profile]);
  const shelter = CAMP_SHELTER[profile];
  if (shelter) place(buildShelter(shelter), -1.6, -1.4, 0.4);
  place(buildHearth(), 0.9, 0.2);
  const poses: Pose[] = ['work', 'walk', 'throw', 'carry', 'point', 'stand'];
  const spots: [number, number, number][] = [
    [0.2, 0.9, 2.3],
    [1.9, 0.8, -1.2],
    [3.0, -0.6, -1.4],
    [-0.2, 2.2, 0.4],
    [1.6, -1.2, 3.6],
    [-2.6, 1.2, 0.8],
  ];
  spots.forEach(([x, z, turn], i) => {
    const kind = KINDS[i % 3]!;
    const m = buildPerson({ profile, kind, variant: i });
    posePerson(m, poses[i]!, 0.3);
    place(m, x, z, turn);
  });
  labels.push({ text: profile, at: new THREE.Vector3(0, -0.3, 4.6) });
  camera.position.set(4, 7, 12);
  camera.lookAt(0, 0.3, 0);
}

function sheltersSheet(): void {
  SHELTERS.forEach((id, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = (col - 1.5) * 7.4;
    const z = row * 7.5 - 3.75;
    ground(x, z, 3.4, '#b2b874');
    place(buildShelter(id), x, z, 0.5);
    labels.push({
      text: id,
      at: row ? new THREE.Vector3(x, 0, z + 3.5) : new THREE.Vector3(x, 3.6, z),
    });
  });
  const ref = buildPerson({ profile: 'ice-age-hunter', kind: 'man' });
  posePerson(ref, 'stand');
  place(ref, -3.7 - 2.6, -3.75 + 2.4, 0.3);
  camera.position.set(0, 17, 33);
  camera.lookAt(0, 0.2, 0);
}

/** Crops of fields-and-crops.md section 1: 13 crops (rows) by 5 stages (columns), a 2 x 2 patch each. */
function cropsSheet(): void {
  CROPS.forEach((id, row) => {
    STAGES.forEach((stage, col) => {
      const g = cropGeometry(id, stage);
      const tris = g.getAttribute('position').count / 3;
      for (let k = 0; k < 4; k++) {
        const mesh = new THREE.Mesh(g, celMaterial());
        mesh.position.set(
          (col - 2) * 3.2 + (k % 2) * 1.1 - 0.55,
          0,
          (row - 6) * 2.2 + Math.floor(k / 2) * 1.1 - 0.55,
        );
        mesh.rotation.y = k * 1.7;
        scene.add(mesh);
      }
      triangles += tris * 4;
      if (row === 0) {
        labels.push({
          text: 'stage ' + stage,
          at: new THREE.Vector3((col - 2) * 3.2, 0.2, -6 * 2.2 - 1.3),
        });
      }
      if (col === 0) {
        labels.push({ text: id, at: new THREE.Vector3(-2 * 3.2 - 2.1, 0.3, (row - 6) * 2.2) });
      }
    });
  });
  ground(0, 0, 17, '#b8a070');
  camera.position.set(0, 34, 30);
  camera.lookAt(0, 0.5, 0.5);
}

function animalsSheet(): void {
  const set = params.get('set') ?? 'large';
  if (set === 'extinct') return wildSheet(false, EXTINCT_ANIMALS);
  if (set.startsWith('wild')) return wildSheet(set === 'wild-small');
  // Two sheets, so the small animals are not lost behind the big ones.
  const large = set !== 'small';
  const ids = PREHISTORIC_ANIMALS.filter(
    (id) =>
      [
        'animal-mammoth',
        'animal-woolly-rhino',
        'animal-bison',
        'animal-horse',
        'animal-cave-bear',
      ].includes(id) === large,
  );
  const gap = large ? 6.4 : 3.4;
  ids.forEach((id, i) => {
    const x = (i - (ids.length - 1) / 2) * gap + (large && i === 0 ? -0.8 : 0);
    ground(x, 0, large ? (i === 0 ? 3.4 : 2.7) : 1.5, '#b2b874');
    place(buildAnimal(id), x, 0, 1.0);
    labels.push({
      text: id.replace('animal-', ''),
      at: new THREE.Vector3(x, large ? (i === 0 ? 4.6 : 3.0) : 1.9, 0),
    });
  });
  const ref = buildPerson({ profile: 'steppe-beringia-hunter', kind: 'man' });
  posePerson(ref, 'point');
  place(ref, large ? -10 : -7.5, large ? 2.6 : 0.8, 1.3);
  const span = gap * ids.length;
  camera.position.set(0, span * 0.24, span * 0.86);
  camera.lookAt(0, large ? 1.3 : 0.7, 0);
}

/** The wildlife of wildlife.md section 6: the big ones in rows, or the small ones; or the extinct megafauna. */
function wildSheet(small: boolean, set: readonly AnimalId[] = WILD_ANIMALS): void {
  const SMALL = ['animal-penguin', 'animal-parrot', 'animal-kea', 'animal-crocodile'];
  const ids = set.filter((id) => SMALL.includes(id) === small);
  const perRow = small ? ids.length : 4;
  const gap = small ? 2.6 : 5.2;
  ids.forEach((id, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = (col - (perRow - 1) / 2) * gap;
    const z = -row * 6.5;
    const m = buildAnimal(id);
    if (!small) ground(x, z, 2.1, '#b2b874');
    else ground(x, z, 1.2, '#b2b874');
    place(m, x, z, 0.9);
    // Birds are built in flight: lift them clear of the plate.
    if (id === 'animal-parrot' || id === 'animal-kea' || id === 'animal-haast-eagle') {
      m.object.position.y = 0.5;
      animateAnimal(m, 'fly', 0.1);
    }
    const height = new THREE.Box3().setFromObject(m.object).max.y;
    labels.push({ text: id.replace('animal-', ''), at: new THREE.Vector3(x, height + 0.4, z) });
  });
  const ref = buildPerson({ profile: 'steppe-beringia-hunter', kind: 'man' });
  posePerson(ref, 'stand');
  place(ref, -((perRow + 1) / 2) * gap, 0, 0.6);
  const span = gap * (perRow + 1);
  camera.position.set(0, span * (small ? 0.3 : 0.75), span * (small ? 0.75 : 1.05));
  camera.lookAt(0, 1.2, small ? 0 : -8);
}

/** One animal or shelter from two sides, framed to its size. */
function singleSheet(): void {
  const id = params.get('id') ?? 'animal-mammoth';
  const build = () =>
    id.startsWith('animal-')
      ? buildAnimal(id as (typeof ANIMALS)[number])
      : buildShelter(id as (typeof SHELTERS)[number]);
  const probe = build();
  const size = new THREE.Box3().setFromObject(probe.object).getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  ground(0, 0, span * 1.9, '#b2b874');
  place(build(), -span * 0.8, 0, 0.7);
  place(build(), span * 0.8, 0, -2.2);
  const ref = buildPerson({ profile: 'ice-age-hunter', kind: 'man' });
  posePerson(ref, 'stand');
  place(ref, 0, 0, 0);
  labels.push({ text: id, at: new THREE.Vector3(0, size.y * 1.15, -span * 0.4) });
  camera.position.set(0, span * 1.1, span * 3.6);
  camera.lookAt(0, size.y * 0.4, 0);
}

/**
 * Neolithic hand tools and village props (docs/spec/neolithic/tools-and-village-props.md): with
 * `id`, one prop from two sides close up; without, all of them in rows beside a man.
 */
function toolsSheet(): void {
  const one = params.get('id');
  const ids = one ? [one] : [...TOOL_PROPS];
  const ref = buildPerson({ profile: 'natufian', kind: 'man' });
  posePerson(ref, 'stand');
  if (one) {
    const probe = buildShelter(one as (typeof SHELTERS)[number]);
    const size = new THREE.Box3().setFromObject(probe.object).getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z);
    ground(0, 0, span * 1.4, '#b2b874');
    place(buildShelter(one as (typeof SHELTERS)[number]), -span * 0.6, 0, 0.6);
    place(buildShelter(one as (typeof SHELTERS)[number]), span * 0.55, 0, Math.PI / 2 + 0.2);
    labels.push({ text: one, at: new THREE.Vector3(0, -0.02, span * 0.8) });
    camera.position.set(0, span * 1.1, span * 3.4);
    camera.lookAt(0, size.y * 0.35, 0);
    return;
  }
  const per = 5;
  ground(0, 0, 14, '#b2b874');
  ids.forEach((id, i) => {
    const x = ((i % per) - (per - 1) / 2) * 4.4;
    const z = Math.floor(i / per) * 4.4 - 3.5;
    const m = place(buildShelter(id as (typeof SHELTERS)[number]), x, z, 0.4);
    const w = new THREE.Box3().setFromObject(m.object).getSize(new THREE.Vector3());
    if (Math.max(w.x, w.y, w.z) > 2.2) m.object.scale.setScalar(0.45);
    labels.push({ text: id.replace('prop-', ''), at: new THREE.Vector3(x, 0, z + 1.8) });
  });
  place(ref, -11.5, 2, 0.3);
  camera.position.set(0, 13, 17);
  camera.lookAt(-1, 0, 1.5);
}

/** A landmark from above and close: `rings` enclosures, `view` = over | close | side. */
function landmarkSheet(): void {
  const rings = Number(params.get('rings') ?? 1);
  const view = params.get('view') ?? 'over';
  const m = place(buildGobekliTepe(rings), 0, 0, 0);
  const ref = buildPerson({ profile: 'natufian', kind: 'man' });
  posePerson(ref, 'stand');
  place(ref, view === 'close' ? 3.4 : 6.5, view === 'close' ? 3.2 : 5, -0.6);
  const size = new THREE.Box3().setFromObject(m.object).getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z);
  if (view === 'close') {
    camera.position.set(6.5, 3.2, 10);
    camera.lookAt(0, 2.2, 0);
  } else if (view === 'side') {
    camera.position.set(0, 2.2, span * 1.4);
    camera.lookAt(0, 2, 0);
  } else {
    camera.position.set(span * 0.55, span * 0.62, span * 0.75);
    camera.lookAt(-3, 0, -3);
  }
  labels.push({
    text: `gobekli-tepe: ${rings} ring${rings > 1 ? 's' : ''}, ${view}`,
    at: new THREE.Vector3(0, -0.2, size.z / 2),
  });
}

/** Any model the review loop handles, by asset id. */
function buildAsset(id: string): Model {
  if (id.startsWith('animal-')) return buildAnimal(id as AnimalId);
  if (id === 'prop-hearth') return buildHearth();
  return buildShelter(id as (typeof SHELTERS)[number]);
}

/** The sheet's optional pose for a moving asset: `&clip=walk&t=0.3`. */
function poseAsset(m: Model, id: string): void {
  const clip = params.get('clip');
  if (clip && id.startsWith('animal-'))
    animateAnimal(m, clip as Clip, Number(params.get('t') ?? 0));
}

/** Set by sheets drawn as several views: renders them all instead of the single camera. */
let renderViews: (() => void) | undefined;

/**
 * Front, side, top and three-quarter views of one asset with a man for scale
 * (review loop, milestone-2 section 13.4). The first three are orthographic.
 */
function viewsSheet(): void {
  const id = params.get('id') ?? 'animal-mammoth';
  const probe = buildAsset(id);
  const box = new THREE.Box3().setFromObject(probe.object);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1.8);
  const half = Math.max(size.y * 0.6, Math.max(size.z, size.x) * 0.68, 1.4);
  ground(0, 0, half * 1.15, '#b2b874');
  const m = place(buildAsset(id), 0, 0, 0);
  poseAsset(m, id);
  const ref = buildPerson({ profile: 'ice-age-hunter', kind: 'man' });
  posePerson(ref, 'stand');
  place(ref, box.max.x + 0.9, box.min.z - 0.4, 0);
  // Centred on the model's box, not its origin, so long tusks or a tail are not cut off.
  const mid = new THREE.Vector3(centre.x, Math.max(size.y, 1.8) * 0.5, centre.z);
  const tiles: { name: string; cam: THREE.Camera }[] = [];
  const ortho = (name: string, at: THREE.Vector3, up: THREE.Vector3) => {
    const aspect = innerWidth / innerHeight;
    const cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 500);
    cam.position.copy(mid).add(at);
    cam.up.copy(up);
    cam.lookAt(mid);
    tiles.push({ name, cam });
  };
  ortho('front', new THREE.Vector3(0, 0, 60), new THREE.Vector3(0, 1, 0));
  ortho('side', new THREE.Vector3(60, 0, 0), new THREE.Vector3(0, 1, 0));
  ortho('top', new THREE.Vector3(0, 60, 0), new THREE.Vector3(0, 0, -1));
  const persp = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 500);
  persp.position.set(span * 1.5, span * 1.0, span * 2.6);
  persp.lookAt(mid);
  tiles.push({ name: 'three-quarter', cam: persp });
  info.text = `${id}: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m (w x h x l), ${Math.round(m.triangles).toLocaleString('en')} triangles`;
  renderViews = () => {
    const w = Math.floor(innerWidth / 2);
    const h = Math.floor(innerHeight / 2);
    renderer.setScissorTest(true);
    tiles.forEach((t, i) => {
      const x = (i % 2) * w;
      const y = (1 - Math.floor(i / 2)) * h;
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      t.cam.updateMatrixWorld();
      cameraLight(t.cam, lightUniforms.lightDir.value);
      const e = t.cam.matrixWorld.elements;
      lightUniforms.screenUp.value.set(e[4]!, e[5]!, e[6]!);
      lightUniforms.viewport.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
      renderer.render(scene, t.cam);
      tileLabels.push({ text: t.name, x: x + 8, y: innerHeight - y - 26 });
    });
    renderer.setScissorTest(false);
  };
  camera.position.copy(persp.position);
}

/**
 * An asset with people around it, in the poses they take in the game
 * (review loop, milestone-2 section 13.4): animals with hunters, shelters with
 * a family, the hearth and someone working at it.
 */
function withPeopleSheet(): void {
  const id = params.get('id') ?? 'animal-mammoth';
  const isAnimal = id.startsWith('animal-');
  const probe = buildAsset(id);
  const size = new THREE.Box3().setFromObject(probe.object).getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.z, 1.8);
  ground(0, 0, span * 2.2, '#b2b874');
  const m = place(buildAsset(id), 0, 0, 0);
  poseAsset(m, id);
  const faceModel = (x: number, z: number) => Math.atan2(-x, -z);
  const cast: { kind: Kind; pose: Pose; x: number; z: number; t?: number }[] = isAnimal
    ? [
        { kind: 'man', pose: 'throw', x: -span * 0.2, z: span * 1.35, t: 0.3 },
        { kind: 'woman', pose: 'point', x: span * 0.75, z: span * 1.25 },
        { kind: 'child', pose: 'stand', x: -span * 0.95, z: span * 1.1 },
      ]
    : [
        { kind: 'man', pose: 'stand', x: -0.6, z: span * 0.85 + 0.6 },
        { kind: 'child', pose: 'stand', x: 0.3, z: span * 0.85 + 0.9 },
        { kind: 'woman', pose: 'work', x: span * 0.9, z: span * 0.5, t: 0.3 },
      ];
  if (!isAnimal) place(buildHearth(), span * 0.55, span * 0.5);
  cast.forEach((c, i) => {
    const p = buildPerson({ profile: 'ice-age-hunter', kind: c.kind, variant: i });
    posePerson(p, c.pose, c.t ?? 0);
    place(p, c.x, c.z, faceModel(c.x, c.z));
    labels.push({ text: c.pose, at: new THREE.Vector3(c.x, 2.0, c.z) });
  });
  camera.position.set(span * 0.9, span * 1.1, span * 3.3);
  camera.lookAt(0, Math.max(size.y, 1.8) * 0.4, span * 0.5);
  info.text = `${id} with people`;
}

/** A shelter going up, step by step, from the frame to the finished shelter. */
function buildSheet(): void {
  const id = (params.get('id') ?? 'shelter-grass-hut') as (typeof SHELTERS)[number];
  const stages = [0.25, 0.5, 0.75, 1];
  stages.forEach((built, i) => {
    const x = (i - (stages.length - 1) / 2) * 3.4;
    ground(x, 0, 1.6, GROUND['african-stone-age']);
    const m = place(buildShelter(id), x, 0, 0.3);
    setBuilt(buildSteps(m), built);
    labels.push({ text: `${Math.round(built * 100)}%`, at: new THREE.Vector3(x, 2.3, 0) });
  });
  const ref = buildPerson({ profile: 'african-stone-age', kind: 'woman' });
  posePerson(ref, 'stand');
  place(ref, 6.6, 0.4, -0.4);
  camera.position.set(0, 5.5, 13);
  camera.lookAt(0, 0.6, 0);
}

/** Frames of one clip side by side, seen from the side, for reviewing motion on a still image. */
function clipsSheet(): void {
  const frames: Record<string, number[]> = {
    idle: [0, 0.8, 1.6, 2.4, 3.2],
    walk: [0, 0.2, 0.4, 0.6, 0.8],
    run: [0, 0.12, 0.24, 0.36, 0.48],
    carry: [0, 0.29, 0.58, 0.86, 1.15],
    work: [0, 0.22, 0.45, 0.67, 0.9],
    knap: [0, 0.18, 0.35, 0.52, 1.5],
    point: [0, 0.4, 0.8, 1.2, 1.6],
    throw: [0, 0.3, 0.5, 0.6, 1.4],
    cheer: [0, 0.17, 0.35, 0.52, 0.7],
  };
  const clip = (params.get('clip') ?? 'walk') as Clip;
  const times = frames[clip]!;
  ground(0, 0, 5, '#c7cfa2');
  times.forEach((t, i) => {
    const m = buildPerson({
      profile: clip === 'knap' ? 'african-stone-age' : 'ice-age-hunter',
      kind: 'man',
    });
    animatePerson(m, clip, t);
    place(m, (i - 2) * 1.7, 0, Math.PI / 2 - Number(params.get('turn') ?? 0.35));
  });
  labels.push({ text: `${clip}: ${times.join(', ')} s`, at: new THREE.Vector3(0, -0.15, 1.6) });
  camera.position.set(0, 2.2, 9.5);
  camera.lookAt(0, 0.8, 0);
}

function clipsAnimalSheet(): void {
  const id = (params.get('id') ?? 'animal-mammoth') as (typeof ANIMALS)[number];
  // The walk as a strip of six frames over one stride, so the knees can be reviewed.
  const step = walkPeriod(buildAnimal(id)) / 6;
  const rows: [Clip, number[]][] = [
    ['walk', [0, 1, 2, 3, 4, 5].map((k) => Math.round(k * step * 100) / 100)],
    ['run', [0, 0.2, 0.4, 0.6]],
    ['fall', [0, 1.0, 2.0, 3.0]],
  ];
  ground(0, 0, 16, '#c7cfa2');
  rows.forEach(([clip, times], r) => {
    const z = (r - 1) * 6.5;
    const gap = times.length > 4 ? 4.4 : 6;
    times.forEach((t, i) => {
      const m = buildAnimal(id);
      animateAnimal(m, clip, t);
      place(m, (i - (times.length - 1) / 2) * gap + 2, z, Math.PI / 2);
    });
    labels.push({ text: `${clip} (${times.join(', ')} s)`, at: new THREE.Vector3(-13, 0.5, z) });
  });
  camera.position.set(0, 26, 24);
  camera.lookAt(0, 0.5, 0.5);
}

/**
 * Animation review (spec milestone 2, section 13.5): one clip, or a sequence
 * of clips, as a grid with one row per view (side, front, top, three-quarter)
 * and one column per frame, every tile framed the same so motion reads
 * across a row. `subject` is `person:<profile>:<kind>` or an animal id; `seq`
 * is `clip:from-to,clip:from-to` (seconds); `n` is the number of frames.
 */
function animSheet(): void {
  const subject = params.get('subject') ?? 'person:ice-age-hunter:man';
  const seq = (params.get('seq') ?? 'walk:0-1').split(',').map((part) => {
    const [clip, range = '0-1'] = part.split(':');
    const [a, b] = range.split('-').map(Number);
    return { clip: clip as Clip, from: a!, to: b ?? a! };
  });
  const n = Number(params.get('n') ?? 8);
  const views = (params.get('views') ?? 'side,front,top,three-quarter').split(',');
  const build = (): { m: Model; animal: boolean } => {
    const [kind, profile, who, tool] = subject.split(':');
    if (kind === 'person') {
      return {
        m: buildPerson({
          profile: profile as never,
          kind: (who ?? 'man') as Kind,
          ...(tool ? { tool: tool as never } : {}),
        }),
        animal: false,
      };
    }
    return { m: buildAnimal(subject as AnimalId), animal: true };
  };
  const { m, animal } = build();
  const total = seq.reduce((s, q) => s + (q.to - q.from), 0);
  const times = Array.from({ length: n }, (_, i) => (i / (n - 1)) * total);
  const pose = (t: number): string => {
    let left = t;
    for (const q of seq) {
      const len = q.to - q.from;
      if (left <= len + 1e-9 || q === seq[seq.length - 1]) {
        (animal ? animateAnimal : animatePerson)(m, q.clip, q.from + Math.min(left, len));
        return q.clip;
      }
      left -= len;
    }
    return '';
  };
  scene.add(m.object);
  triangles += m.triangles;
  const box = new THREE.Box3();
  for (const t of times) {
    pose(t);
    m.object.updateMatrixWorld(true);
    box.union(new THREE.Box3().setFromObject(m.object));
  }
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const R = (Math.hypot(size.x, size.y, size.z) / 2) * 0.85;
  const dirs: Record<string, [THREE.Vector3, THREE.Vector3]> = {
    side: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
    front: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
    top: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)],
    'three-quarter': [new THREE.Vector3(1, 0.55, 1).normalize(), new THREE.Vector3(0, 1, 0)],
  };
  const tileW = Math.floor(innerWidth / n);
  const tileH = Math.floor((innerHeight - 24) / views.length);
  renderer.setScissorTest(true);
  const render = (): void => {
    renderer.setClearColor(0xfbe3d4);
    renderer.setScissor(0, 0, innerWidth, innerHeight);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.clear();
    const pr = renderer.getPixelRatio();
    views.forEach((view, row) => {
      const [dir, up] = dirs[view]!;
      const wide =
        view === 'side' ? size.z : view === 'front' ? size.x : view === 'top' ? size.x : 0;
      const high = view === 'side' || view === 'front' ? size.y : view === 'top' ? size.z : 0;
      const half =
        view === 'three-quarter' ? R : (Math.max(high, wide / (tileW / tileH)) / 2) * 1.08;
      const aspect = tileW / tileH;
      const cam = new THREE.OrthographicCamera(
        -half * aspect,
        half * aspect,
        half,
        -half,
        0.1,
        100,
      );
      cam.up.copy(up);
      cam.position.copy(c).addScaledVector(dir, 20);
      cam.lookAt(c);
      cam.updateMatrixWorld();
      cameraLight(cam, lightUniforms.lightDir.value);
      const e2 = cam.matrixWorld.elements;
      lightUniforms.screenUp.value.set(e2[4]!, e2[5]!, e2[6]!);
      times.forEach((t, col) => {
        pose(t);
        const x = col * tileW;
        const y = innerHeight - (row + 1) * tileH;
        renderer.setViewport(x, y, tileW, tileH);
        renderer.setScissor(x, y, tileW, tileH);
        lightUniforms.viewport.value.set(tileW * pr, tileH * pr);
        lightUniforms.inkPixels.value = 1.6 * pr;
        lightUniforms.inkFullPixels.value = 40 * pr;
        renderer.render(scene, cam);
      });
    });
  };
  customRender = render;
  render();
  const name = animal ? subject : subject.split(':').slice(1).join(' ');
  labels.length = 0;
  const caption = seq.map((q) => `${q.clip} ${q.from}-${q.to}s`).join(' then ');
  views.forEach((view, row) => {
    const d = document.createElement('div');
    d.textContent = view;
    Object.assign(d.style, {
      position: 'absolute',
      left: '6px',
      top: `${24 + row * tileH + 4}px`,
      font: '600 12px system-ui',
      color: '#3a261c',
    });
    document.body.appendChild(d);
  });
  times.forEach((t, col) => {
    const d = document.createElement('div');
    d.textContent = `${pose(t)} ${t.toFixed(2)}s`;
    Object.assign(d.style, {
      position: 'absolute',
      left: `${col * tileW + tileW / 2}px`,
      top: `${24 + views.length * tileH}px`,
      transform: 'translate(-50%, -18px)',
      font: '600 11px system-ui',
      color: '#3a261c',
      background: '#fff6ee',
      padding: '0 5px',
      borderRadius: '6px',
    });
    document.body.appendChild(d);
  });
  document.title = `${name}: ${caption} (${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m)`;
}

/** The first person (spec humankind.md section 2.1): a turnaround beside an ordinary woman. */
function founderSheet(): void {
  ground(0, 0, 3.6, GROUND['african-stone-age']);
  for (let a = 0; a < 4; a++) {
    const m = buildPerson({ profile: 'african-stone-age', kind: 'woman', founder: true });
    posePerson(m, 'stand');
    place(m, -2.4 + a * 1.15, 0, (a * Math.PI) / 2);
  }
  const plain = buildPerson({ profile: 'african-stone-age', kind: 'woman' });
  posePerson(plain, 'stand');
  place(plain, 2.6, 0, 0);
  labels.push({
    text: 'first person: front, left, back, right; an ordinary woman',
    at: new THREE.Vector3(0, -0.1, 2.2),
  });
  camera.position.set(0, 2.0, 8.5);
  camera.lookAt(0, 0.9, 0);
}

/** The first person's camp at Lake Turkana: grass hut, hearth, and her hunting an eland. */
function founderCampSheet(): void {
  ground(0, 0, 5.5, GROUND['african-stone-age']);
  place(buildShelter('shelter-grass-hut'), -2.0, -1.2, 0.5);
  place(buildHearth(), -0.4, 0.8);
  const hunter = buildPerson({ profile: 'african-stone-age', kind: 'woman', founder: true });
  posePerson(hunter, 'throw');
  place(hunter, 1.2, 1.0, 1.1);
  place(buildAnimal('animal-eland'), 3.6, -0.8, -1.9);
  labels.push({ text: 'her first camp at Lake Turkana', at: new THREE.Vector3(0, -0.3, 4.6) });
  camera.position.set(2, 6, 12);
  camera.lookAt(0.4, 0.6, 0);
}

/**
 * The first person moving, for checking that her motion is fluid: she walks
 * in, throws her spear, walks on, crouches to work and stands. Each change of
 * clip is eased over BLEND_SECONDS. Frames come from `window.setFrame(t)`.
 */
function founderMotionSheet(): void {
  ground(0, 0, 10, GROUND['african-stone-age']);
  place(buildShelter('shelter-grass-hut'), 1.6, -3.4, 0.5);
  place(buildHearth(), -0.6, -1.2);
  const her = buildPerson({ profile: 'african-stone-age', kind: 'woman', founder: true });
  place(her, -7, 0, Math.PI / 2);
  // Clip and start time; she moves at the clip's gait speed, so her standing foot stays put.
  const plan: [Clip, number][] = [
    ['walk', 0],
    ['work', 5],
    ['idle', 8.5],
    ['walk', 10],
    ['throw', 12.5],
  ];
  const speed = (u: number) => {
    let k = 0;
    while (k + 1 < plan.length && plan[k + 1]![1] <= u) k++;
    const v = gaitSpeed(her, plan[k]![0]);
    if (k === 0) return v;
    const w = Math.min(1, (u - plan[k]![1]) / BLEND_SECONDS);
    const eased = w * w * (3 - 2 * w);
    return gaitSpeed(her, plan[k - 1]![0]) * (1 - eased) + v * eased;
  };
  update = (t) => {
    let i = 0;
    while (i + 1 < plan.length && plan[i + 1]![1] <= t) i++;
    const [clip, start] = plan[i]!;
    const into = t - start;
    if (i > 0 && into < BLEND_SECONDS) {
      const [prev, prevStart] = plan[i - 1]!;
      blendPerson(her, prev, t - prevStart, clip, into, into / BLEND_SECONDS);
    } else animatePerson(her, clip, into);
    let x = -7;
    const dt = 1 / 240;
    for (let u = 0; u < t; u += dt) x += speed(u) * Math.min(dt, t - u);
    her.object.position.x = x;
    // The camera follows her slowly.
    camera.position.set(x * 0.7, 2.1, 8);
    camera.lookAt(x * 0.7, 0.85, 0);
    camera.updateMatrixWorld();
  };
  update(0);
}

const sheets: Record<string, () => void> = {
  anim: animSheet,
  'founder-motion': founderMotionSheet,
  founder: founderSheet,
  'founder-camp': founderCampSheet,
  clips: clipsSheet,
  'clips-animal': clipsAnimalSheet,
  single: singleSheet,
  tools: toolsSheet,
  landmark: landmarkSheet,
  views: viewsSheet,
  'with-people': withPeopleSheet,
  build: buildSheet,
  people: peopleSheet,
  turnaround: turnaroundSheet,
  camp: campSheet,
  shelters: sheltersSheet,
  animals: animalsSheet,
  crops: cropsSheet,
};
sheets[sheetName]!();

camera.updateMatrixWorld();
cameraLight(camera, lightUniforms.lightDir.value);
const e = camera.matrixWorld.elements;
lightUniforms.screenUp.value.set(e[4]!, e[5]!, e[6]!);
lightUniforms.viewport.value.set(
  innerWidth * renderer.getPixelRatio(),
  innerHeight * renderer.getPixelRatio(),
);
lightUniforms.inkPixels.value = 1.6 * renderer.getPixelRatio();
lightUniforms.inkFullPixels.value = 40 * renderer.getPixelRatio();
if (renderViews) renderViews();
else if (!customRender) renderer.render(scene, camera);
if (update) {
  const step = update;
  (window as unknown as { setFrame: (t: number) => void }).setFrame = (t) => {
    step(t);
    renderer.render(scene, camera);
  };
}

for (const l of labels) {
  const p = l.at.clone().project(camera);
  const div = document.createElement('div');
  div.textContent = l.text;
  Object.assign(div.style, {
    position: 'absolute',
    left: `${((p.x + 1) / 2) * innerWidth}px`,
    top: `${((1 - p.y) / 2) * innerHeight}px`,
    transform: 'translate(-50%, 0)',
    font: '600 15px system-ui, sans-serif',
    color: '#3a261c',
    background: '#fff6ee',
    padding: '2px 8px',
    borderRadius: '8px',
  });
  document.body.appendChild(div);
}
for (const t of tileLabels) {
  const div = document.createElement('div');
  div.textContent = t.text;
  Object.assign(div.style, {
    position: 'absolute',
    left: `${t.x}px`,
    top: `${t.y}px`,
    font: '600 14px system-ui',
    color: '#3a261c',
  });
  document.body.appendChild(div);
}
const infoDiv = document.createElement('div');
infoDiv.textContent =
  info.text ||
  `${customRender ? document.title : sheetName}: ${Math.round(triangles).toLocaleString('en')} triangles`;
Object.assign(infoDiv.style, {
  position: 'absolute',
  left: '12px',
  top: '10px',
  font: '600 14px system-ui',
  color: '#3a261c',
});
document.body.appendChild(infoDiv);
document.body.dataset.ready = '1';
