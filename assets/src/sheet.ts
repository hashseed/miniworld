// Review sheets (spec milestone 2, section 13.3): models drawn in the app's
// cel-shaded clay look for Yang to approve. Development tool only; the
// labels are for the reviewer, not viewer-facing text.

import * as THREE from 'three';
import { cameraLight } from '../../app/src/globe/sky.ts';
import { ModelBuilder, blob, lightUniforms, type Model } from './kit.ts';
import { PROFILES, buildPerson, posePerson, type Kind, type Pose } from './people.ts';
import { SHELTERS, buildShelter, buildHearth, CAMP_SHELTER } from './shelters.ts';
import { ANIMALS, buildAnimal } from './animals.ts';
import { animateAnimal, animatePerson, type Clip } from './clips.ts';

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
};

const KINDS: Kind[] = ['man', 'woman', 'child'];

function peopleSheet(): void {
  const poses: Pose[] = ['stand', 'point', 'carry'];
  PROFILES.forEach((p, i) => {
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
  camera.position.set(0, 7.5, 15.5);
  camera.lookAt(0, 0.2, -0.2);
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

function animalsSheet(): void {
  // Two sheets, so the small animals are not lost behind the big ones.
  const large = params.get('set') !== 'small';
  const ids = ANIMALS.filter(
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
  place(ref, 0, span * 0.9, 0);
  labels.push({ text: id, at: new THREE.Vector3(0, size.y * 1.15, -span * 0.4) });
  camera.position.set(0, span * 1.1, span * 3.6);
  camera.lookAt(0, size.y * 0.4, 0);
}

/** Frames of one clip side by side, seen from the side, for reviewing motion on a still image. */
function clipsSheet(): void {
  const frames: Record<string, number[]> = {
    idle: [0, 0.8, 1.6, 2.4, 3.2],
    walk: [0, 0.2, 0.4, 0.6, 0.8],
    run: [0, 0.12, 0.24, 0.36, 0.48],
    carry: [0, 0.29, 0.58, 0.86, 1.15],
    work: [0, 0.22, 0.45, 0.67, 0.9],
    point: [0, 0.4, 0.8, 1.2, 1.6],
    throw: [0, 0.3, 0.5, 0.6, 1.4],
    cheer: [0, 0.17, 0.35, 0.52, 0.7],
  };
  const clip = (params.get('clip') ?? 'walk') as Clip;
  const times = frames[clip]!;
  ground(0, 0, 5, '#c7cfa2');
  times.forEach((t, i) => {
    const m = buildPerson({ profile: 'ice-age-hunter', kind: 'man' });
    animatePerson(m, clip, t);
    place(m, (i - 2) * 1.7, 0, Math.PI / 2 - 0.35);
  });
  labels.push({ text: `${clip}: ${times.join(', ')} s`, at: new THREE.Vector3(0, -0.15, 1.6) });
  camera.position.set(0, 2.2, 9.5);
  camera.lookAt(0, 0.8, 0);
}

function clipsAnimalSheet(): void {
  const id = (params.get('id') ?? 'animal-mammoth') as (typeof ANIMALS)[number];
  const rows: [Clip, number[]][] = [
    ['walk', [0, 0.4, 0.8, 1.2]],
    ['run', [0, 0.2, 0.4, 0.6]],
    ['fall', [0, 1.0, 2.0, 3.0]],
  ];
  ground(0, 0, 14, '#c7cfa2');
  rows.forEach(([clip, times], r) => {
    const z = (r - 1) * 6.5;
    times.forEach((t, i) => {
      const m = buildAnimal(id);
      animateAnimal(m, clip, t);
      place(m, (i - 1.5) * 6 + 2, z, Math.PI / 2);
    });
    labels.push({ text: `${clip} (${times.join(', ')} s)`, at: new THREE.Vector3(-11.5, 0.5, z) });
  });
  camera.position.set(0, 26, 24);
  camera.lookAt(0, 0, 0.5);
}

const sheets: Record<string, () => void> = {
  clips: clipsSheet,
  'clips-animal': clipsAnimalSheet,
  single: singleSheet,
  people: peopleSheet,
  turnaround: turnaroundSheet,
  camp: campSheet,
  shelters: sheltersSheet,
  animals: animalsSheet,
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
renderer.render(scene, camera);

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
const info = document.createElement('div');
info.textContent = `${sheetName}: ${Math.round(triangles).toLocaleString('en')} triangles`;
Object.assign(info.style, {
  position: 'absolute',
  left: '12px',
  top: '10px',
  font: '600 14px system-ui',
  color: '#3a261c',
});
document.body.appendChild(info);
document.body.dataset.ready = '1';
