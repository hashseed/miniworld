// Developer Art & Placement Inspector (`?debug=1`, docs/spec/art-direction.md section 4).
// Lazily imported only when `?debug=1` is present in the URL; never touches viewer UI.

import * as THREE from 'three';
import type { StartupIndex } from '../content/types.ts';
import type { ContentLoader } from '../content/loader.ts';
import { latLonToDir, type Vec3 } from '../geo/cube.ts';
import { EARTH_RADIUS_KM, northEast } from '../geo/earth.ts';
import type { CameraController } from '../globe/cameraController.ts';
import type { Globe } from '../globe/globe.ts';
import type { Clock } from '../time/clock.ts';
import { SitesLayer } from '../tree/sitesLayer.ts';
import type { SurfaceSource } from '../tree/surface.ts';
import type { DebugLodgingSnapshot, TreeLayer } from '../tree/treeLayer.ts';
import type { WildlifeLayer } from '../wildlife/wildlifeLayer.ts';
import { LAYOUT_KM_PER_M } from '../world/treeScene.ts';
import { maskCentre, maskLand, MASK_RINGS, MASK_SECTORS } from '../world/fieldMask.ts';
import {
  isNeolithicProfile,
  NEOLITHIC_PROFILES,
  neolithicProfile,
} from '../world/neolithicProfiles.ts';
import { WILD_GROUPS, WILD_MASK_N, wildMaskCell } from '../world/wildlife.ts';

export type GroundStatus = 'ok' | 'warn' | 'violation';

export interface DebugToggles {
  wildlifeMasks: boolean;
  keepOuts: boolean;
  villageMasks: boolean;
  houseFootprints: boolean;
  sites: boolean;
}

export interface TuningSnapshot {
  cultures: Record<string, number>;
  wildlife: Record<string, number>;
}

/** Classifies a house's terrain seating against hover gap, uphold bury, and plinth depth. */
export function classifyGrounding(
  hoverGapKm: number,
  buryOverKm: number,
  reliefKm: number,
  plinthDepthKm: number,
): GroundStatus {
  if (hoverGapKm > 1e-4 || buryOverKm > 1e-4) return 'violation';
  if (plinthDepthKm > 0 && reliefKm > plinthDepthKm * 0.75) return 'warn';
  return 'ok';
}

/** Produces a minimal JSON diff containing only values tuned away from their defaults. */
export function buildTuningDiff(
  base: TuningSnapshot,
  current: TuningSnapshot,
): {
  cultures?: Record<string, { houseM: number }>;
  wildlife?: Record<string, { drawnM: number }>;
} {
  const cultures: Record<string, { houseM: number }> = {};
  for (const [id, val] of Object.entries(current.cultures)) {
    const def = base.cultures[id];
    if (def === undefined || Math.abs(val - def) > 1e-4) {
      cultures[id] = { houseM: Number(val.toFixed(2)) };
    }
  }
  const wildlife: Record<string, { drawnM: number }> = {};
  for (const [model, val] of Object.entries(current.wildlife)) {
    const def = base.wildlife[model];
    if (def === undefined || Math.abs(val - def) > 1e-4) {
      wildlife[model] = { drawnM: Number(val.toFixed(2)) };
    }
  }
  return {
    ...(Object.keys(cultures).length ? { cultures } : {}),
    ...(Object.keys(wildlife).length ? { wildlife } : {}),
  };
}

export interface DebugInspectorContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  globe: Globe;
  tree: TreeLayer;
  wildlife: WildlifeLayer;
  controller: CameraController;
  clock: Clock;
  loader: ContentLoader;
  index: StartupIndex;
  surface: SurfaceSource;
  sitesFile: string | undefined;
}

const STATUS_HEX: Record<GroundStatus, number> = {
  ok: 0x22c55e,
  warn: 0xf59e0b,
  violation: 0xef4444,
};

const LIFT_FOOTPRINT_KM = 18;
const LIFT_MASK_KM = 22;
const LIFT_RING_KM = 24;
const MAX_WILD_MASKS = 2;
const RING_STEPS = 32;

function unitOffset(dir: Vec3, eastKm: number, northKm: number): Vec3 {
  const up = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const n = new THREE.Vector3();
  const e = new THREE.Vector3();
  northEast(up, n, e);
  up.multiplyScalar(EARTH_RADIUS_KM)
    .addScaledVector(e, eastKm)
    .addScaledVector(n, northKm)
    .normalize();
  return [up.x, up.y, up.z];
}

function inViewCone(
  dir: Vec3,
  camDir: THREE.Vector3,
  focusDir: Vec3,
  limbCutoff: number,
  focusCutoff: number,
): boolean {
  const camDot = dir[0] * camDir.x + dir[1] * camDir.y + dir[2] * camDir.z;
  if (camDot < limbCutoff) return false;
  const focusDot = dir[0] * focusDir[0] + dir[1] * focusDir[1] + dir[2] * focusDir[2];
  return focusDot >= focusCutoff;
}

export class DebugInspector {
  readonly group = new THREE.Group();
  readonly toggles: DebugToggles = {
    wildlifeMasks: false,
    keepOuts: false,
    villageMasks: false,
    houseFootprints: true,
    sites: false,
  };

  private ctx: DebugInspectorContext;
  private sitesLayer: SitesLayer | undefined;
  private wildPoints: THREE.Points;
  private villagePoints: THREE.Points;
  private footprintLines: THREE.LineSegments;
  private keepOutLines: THREE.LineSegments;
  private panel: HTMLDivElement;
  private statsEl: HTMLDivElement;
  private cultureSelect: HTMLSelectElement;
  private houseSlider: HTMLInputElement;
  private houseValEl: HTMLSpanElement;
  private speciesSelect: HTMLSelectElement;
  private drawnSlider: HTMLInputElement;
  private drawnValEl: HTMLSpanElement;
  private diffPre: HTMLPreElement;
  private copyBtn: HTMLButtonElement;
  private collapsed = false;
  private bodyEl: HTMLDivElement;

  private baseTuning: TuningSnapshot;
  private currentTuning: TuningSnapshot = { cultures: {}, wildlife: {} };
  private userPickedCulture = false;
  private userPickedSpecies = false;
  private lastBuildMs = 0;
  private lastStateKey = '';

  constructor(ctx: DebugInspectorContext) {
    this.ctx = ctx;
    this.ctx.tree.debugEnabled = true;

    const baseCultures: Record<string, number> = {};
    for (const id of Object.keys(NEOLITHIC_PROFILES)) {
      if (isNeolithicProfile(id)) baseCultures[id] = neolithicProfile(id).houseM ?? 2.7;
    }
    const wildModels = [...new Set(WILD_GROUPS.map((g) => g.model))].sort();
    const baseWildlife: Record<string, number> = {};
    const initialSnap = ctx.wildlife.debugSnapshot(ctx.clock.day);
    for (const g of initialSnap.groups) baseWildlife[g.model] = g.baseDrawnM;
    this.baseTuning = { cultures: baseCultures, wildlife: baseWildlife };

    const ptsMat = () =>
      new THREE.PointsMaterial({
        size: 6,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
      });
    const lineMat = (opacity = 0.95) =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
      });

    this.wildPoints = new THREE.Points(new THREE.BufferGeometry(), ptsMat());
    this.villagePoints = new THREE.Points(new THREE.BufferGeometry(), ptsMat());
    this.footprintLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0.95));
    this.keepOutLines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat(0.85));
    for (const obj of [
      this.wildPoints,
      this.villagePoints,
      this.footprintLines,
      this.keepOutLines,
    ]) {
      obj.frustumCulled = false;
      obj.renderOrder = 12;
      this.group.add(obj);
    }
    ctx.scene.add(this.group);

    this.panel = document.createElement('div');
    this.panel.dataset.debugPanel = '1';
    Object.assign(this.panel.style, {
      position: 'fixed',
      top: '12px',
      left: '12px',
      width: '286px',
      maxHeight: 'calc(100vh - 76px)',
      overflowY: 'auto',
      zIndex: '40',
      background: 'rgba(20, 18, 16, 0.88)',
      color: '#f5efe6',
      font: '500 12px/1.4 system-ui, -apple-system, sans-serif',
      borderRadius: '10px',
      border: '1px solid rgba(255,255,255,0.14)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      padding: '10px 12px',
      pointerEvents: 'auto',
    });
    for (const ev of ['pointerdown', 'pointermove', 'wheel']) {
      this.panel.addEventListener(ev, (e) => e.stopPropagation());
    }

    const head = document.createElement('div');
    Object.assign(head.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '6px',
    });
    const title = document.createElement('strong');
    title.textContent = 'Art & Placement Inspector';
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.textContent = '−';
    Object.assign(collapseBtn.style, {
      background: 'rgba(255,255,255,0.1)',
      color: '#f5efe6',
      border: 'none',
      borderRadius: '4px',
      width: '22px',
      height: '22px',
      cursor: 'pointer',
    });
    head.append(title, collapseBtn);

    this.bodyEl = document.createElement('div');
    collapseBtn.onclick = () => {
      this.collapsed = !this.collapsed;
      this.bodyEl.style.display = this.collapsed ? 'none' : 'block';
      collapseBtn.textContent = this.collapsed ? '+' : '−';
    };

    this.statsEl = document.createElement('div');
    Object.assign(this.statsEl.style, {
      fontSize: '11px',
      color: '#d8cec0',
      background: 'rgba(255,255,255,0.06)',
      borderRadius: '6px',
      padding: '6px 8px',
      marginBottom: '8px',
      whiteSpace: 'pre-line',
    });

    const overlaysEl = document.createElement('div');
    Object.assign(overlaysEl.style, {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '4px',
      marginBottom: '10px',
    });
    const overlayDefs: [keyof DebugToggles, string][] = [
      ['houseFootprints', 'House footprints & relief'],
      ['villageMasks', 'Village fieldLand / share masks'],
      ['wildlifeMasks', 'Wildlife 48×48 masks'],
      ['keepOuts', 'Keep-out rings & obstacles'],
      ['sites', 'Camp sites & links (?sites)'],
    ];
    for (const [key, labelText] of overlayDefs) {
      const label = document.createElement('label');
      Object.assign(label.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        cursor: 'pointer',
      });
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = this.toggles[key];
      cb.dataset.debugToggle = key;
      cb.onchange = () => this.setToggle(key, cb.checked);
      label.append(cb, document.createTextNode(labelText));
      overlaysEl.appendChild(label);
    }

    const tuneEl = document.createElement('div');
    Object.assign(tuneEl.style, {
      borderTop: '1px solid rgba(255,255,255,0.12)',
      paddingTop: '8px',
      marginBottom: '8px',
    });

    this.cultureSelect = document.createElement('select');
    this.speciesSelect = document.createElement('select');
    for (const sel of [this.cultureSelect, this.speciesSelect]) {
      Object.assign(sel.style, {
        width: '100%',
        marginTop: '3px',
        marginBottom: '4px',
        background: '#2a2622',
        color: '#f5efe6',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: '4px',
        padding: '3px 5px',
      });
    }
    for (const id of Object.keys(baseCultures).sort()) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = id;
      this.cultureSelect.appendChild(opt);
    }
    for (const m of wildModels) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m.replace('animal-', '');
      this.speciesSelect.appendChild(opt);
    }

    this.houseSlider = document.createElement('input');
    this.houseSlider.type = 'range';
    this.houseSlider.min = '1.5';
    this.houseSlider.max = '10';
    this.houseSlider.step = '0.05';
    this.houseSlider.style.width = '100%';
    this.houseValEl = document.createElement('span');

    this.drawnSlider = document.createElement('input');
    this.drawnSlider.type = 'range';
    this.drawnSlider.min = '0.8';
    this.drawnSlider.max = '6';
    this.drawnSlider.step = '0.1';
    this.drawnSlider.style.width = '100%';
    this.drawnValEl = document.createElement('span');

    const houseRow = document.createElement('div');
    houseRow.append(
      this.makeRowLabel('Culture houseM', this.houseValEl),
      this.cultureSelect,
      this.houseSlider,
    );
    const wildRow = document.createElement('div');
    wildRow.style.marginTop = '6px';
    wildRow.append(
      this.makeRowLabel('Wildlife drawnM', this.drawnValEl),
      this.speciesSelect,
      this.drawnSlider,
    );
    tuneEl.append(houseRow, wildRow);

    this.cultureSelect.onchange = () => {
      this.userPickedCulture = true;
      this.syncSliders();
    };
    this.houseSlider.oninput = () => {
      const id = this.cultureSelect.value;
      const val = Number(this.houseSlider.value);
      this.currentTuning.cultures[id] = val;
      this.ctx.tree.debugTuning = {
        ...this.ctx.tree.debugTuning,
        cultureHouseM: { ...this.currentTuning.cultures },
      };
      this.ctx.tree.clearDebugCaches();
      this.syncSliders();
      this.lastStateKey = '';
    };

    this.speciesSelect.onchange = () => {
      this.userPickedSpecies = true;
      this.syncSliders();
    };
    this.drawnSlider.oninput = () => {
      const model = this.speciesSelect.value;
      const val = Number(this.drawnSlider.value);
      this.currentTuning.wildlife[model] = val;
      this.ctx.wildlife.debugTuning = {
        ...this.ctx.wildlife.debugTuning,
        speciesDrawnM: { ...this.currentTuning.wildlife },
      };
      this.ctx.wildlife.clearDebugCaches();
      this.syncSliders();
      this.lastStateKey = '';
    };

    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, { display: 'flex', gap: '6px', marginBottom: '6px' });
    this.copyBtn = document.createElement('button');
    this.copyBtn.type = 'button';
    this.copyBtn.textContent = 'Copy JSON diff';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset';
    for (const b of [this.copyBtn, resetBtn]) {
      Object.assign(b.style, {
        flex: '1',
        background: '#3d3730',
        color: '#f5efe6',
        border: '1px solid rgba(255,255,255,0.16)',
        borderRadius: '5px',
        padding: '5px 8px',
        cursor: 'pointer',
        fontSize: '11px',
      });
    }
    this.copyBtn.onclick = () => void this.copyDiff();
    resetBtn.onclick = () => {
      this.currentTuning = { cultures: {}, wildlife: {} };
      this.ctx.tree.debugTuning = undefined;
      this.ctx.tree.clearDebugCaches();
      this.ctx.wildlife.debugTuning = undefined;
      this.ctx.wildlife.clearDebugCaches();
      this.syncSliders();
      this.lastStateKey = '';
    };
    btnRow.append(this.copyBtn, resetBtn);

    this.diffPre = document.createElement('pre');
    Object.assign(this.diffPre.style, {
      margin: '0',
      padding: '6px',
      borderRadius: '5px',
      background: 'rgba(0,0,0,0.35)',
      fontSize: '10px',
      maxHeight: '90px',
      overflow: 'auto',
      display: 'none',
    });

    this.bodyEl.append(this.statsEl, overlaysEl, tuneEl, btnRow, this.diffPre);
    this.panel.append(head, this.bodyEl);
    document.body.appendChild(this.panel);
    this.syncSliders();
  }

  private makeRowLabel(name: string, valEl: HTMLElement): HTMLDivElement {
    const d = document.createElement('div');
    Object.assign(d.style, { display: 'flex', justifyContent: 'space-between', fontSize: '11px' });
    const left = document.createElement('span');
    left.textContent = name;
    valEl.style.color = '#f6c453';
    d.append(left, valEl);
    return d;
  }

  private syncSliders(): void {
    const cid = this.cultureSelect.value;
    const baseH = this.baseTuning.cultures[cid] ?? 2.7;
    const curH = this.currentTuning.cultures[cid] ?? baseH;
    this.houseSlider.value = String(curH);
    this.houseValEl.textContent = `${curH.toFixed(2)} m (def ${baseH.toFixed(2)})`;

    const mid = this.speciesSelect.value;
    const snap = this.ctx.wildlife.debugSnapshot(this.ctx.clock.day);
    const hit = snap.groups.find((g) => g.model === mid);
    if (hit && this.baseTuning.wildlife[mid] === undefined) {
      this.baseTuning.wildlife[mid] = hit.baseDrawnM;
    }
    const baseW = this.baseTuning.wildlife[mid] ?? 2.5;
    const curW = this.currentTuning.wildlife[mid] ?? baseW;
    this.drawnSlider.value = String(curW);
    this.drawnValEl.textContent = `${curW.toFixed(2)} m (def ${baseW.toFixed(2)})`;

    const diff = buildTuningDiff(this.baseTuning, this.currentTuning);
    const hasDiff = Object.keys(diff).length > 0;
    this.diffPre.style.display = hasDiff ? 'block' : 'none';
    this.diffPre.textContent = hasDiff ? JSON.stringify(diff, null, 2) : '';
  }

  private async copyDiff(): Promise<void> {
    const json = JSON.stringify(buildTuningDiff(this.baseTuning, this.currentTuning), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      this.copyBtn.textContent = 'Copied!';
      setTimeout(() => (this.copyBtn.textContent = 'Copy JSON diff'), 1400);
    } catch {
      this.diffPre.style.display = 'block';
      this.diffPre.textContent = json;
    }
  }

  setToggle(key: keyof DebugToggles, on: boolean): void {
    this.toggles[key] = on;
    const cb = this.panel.querySelector<HTMLInputElement>(`input[data-debug-toggle="${key}"]`);
    if (cb) cb.checked = on;
    if (key === 'sites' && on && !this.sitesLayer && this.ctx.sitesFile) {
      this.sitesLayer = new SitesLayer(
        this.ctx.loader,
        {
          surfaceKm: this.ctx.surface.surfaceKm,
          toDrawn: (d) => this.ctx.globe.lens.toDrawn(d),
        },
        this.ctx.sitesFile,
      );
      this.group.add(this.sitesLayer.group);
    }
    if (this.sitesLayer) this.sitesLayer.group.visible = this.toggles.sites;
    this.lastStateKey = '';
  }

  update(seaLevel: number, day: number, camera: THREE.Camera): void {
    if (this.sitesLayer && this.toggles.sites) this.sitesLayer.update(seaLevel, camera);
    const treeSnap = this.ctx.tree.debugSnapshot();
    const wildSnap = this.ctx.wildlife.debugSnapshot(day);
    for (const g of wildSnap.groups) {
      if (this.baseTuning.wildlife[g.model] === undefined) {
        this.baseTuning.wildlife[g.model] = g.baseDrawnM;
      }
    }

    const c = this.ctx.controller.state;
    const camDir = new THREE.Vector3().copy(camera.position).normalize();
    if (!this.userPickedCulture && treeSnap.villages.length > 0) {
      let bestVillage = treeSnap.villages[0]!;
      let bestDot = -Infinity;
      for (const v of treeSnap.villages) {
        if (!v.culture) continue;
        const d = this.ctx.globe.lens.toDrawn(latLonToDir(v.lat, v.lon));
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        const dot = (d[0] * camDir.x + d[1] * camDir.y + d[2] * camDir.z) / len;
        if (dot > bestDot) {
          bestDot = dot;
          bestVillage = v;
        }
      }
      if (bestVillage.culture && bestVillage.culture !== this.cultureSelect.value) {
        this.cultureSelect.value = bestVillage.culture;
        this.syncSliders();
      }
    }

    if (!this.userPickedSpecies && wildSnap.groups.length > 0) {
      let best = wildSnap.groups[0]!;
      let bestDot = -Infinity;
      for (const g of wildSnap.groups) {
        const d = this.ctx.globe.lens.toDrawn(latLonToDir(g.lat, g.lon));
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        const dot = (d[0] * camDir.x + d[1] * camDir.y + d[2] * camDir.z) / len;
        if (dot > bestDot) {
          bestDot = dot;
          best = g;
        }
      }
      if (best.model !== this.speciesSelect.value) {
        this.speciesSelect.value = best.model;
        this.syncSliders();
      }
    }

    let maxReliefKm = 0;
    let violations = 0;
    for (const l of treeSnap.lodgings) {
      if (l.reliefKm > maxReliefKm) maxReliefKm = l.reliefKm;
      if (
        classifyGrounding(l.hoverGapKm, l.buryOverKm, l.reliefKm, l.plinthDepthKm) === 'violation'
      )
        violations++;
    }
    this.statsEl.textContent =
      `cam ${c.lat.toFixed(2)}, ${c.lon.toFixed(2)} | alt ${Math.round(c.altitudeKm)} km\n` +
      `villages ${treeSnap.villages.length} | houses ${treeSnap.lodgings.length} | wild ${wildSnap.groups.length}\n` +
      `max corner relief ${(maxReliefKm / 72.25).toFixed(2)} m | violations ${violations}`;

    const now = performance.now();
    const key = [
      Math.round(c.lat * 4),
      Math.round(c.lon * 4),
      Math.round(c.altitudeKm / 50),
      this.ctx.surface.version?.() ?? 0,
      treeSnap.lodgings.length,
      treeSnap.villages.length,
      this.toggles.wildlifeMasks,
      this.toggles.keepOuts,
      this.toggles.villageMasks,
      this.toggles.houseFootprints,
      Math.round((this.currentTuning.cultures[this.cultureSelect.value] ?? 0) * 100),
    ].join('|');
    if (key === this.lastStateKey && now - this.lastBuildMs < 500) return;
    if (now - this.lastBuildMs < 200 && this.lastStateKey !== '') return;
    this.lastBuildMs = now;
    this.lastStateKey = key;

    const rawFocus = this.ctx.globe.lens.toDrawn(latLonToDir(c.lat, c.lon));
    const fLen = Math.hypot(rawFocus[0], rawFocus[1], rawFocus[2]) || 1;
    const focusDir: Vec3 = [rawFocus[0] / fLen, rawFocus[1] / fLen, rawFocus[2] / fLen];
    const limbCutoff = Math.min(0.99, EARTH_RADIUS_KM / camera.position.length() + 0.14);
    const coneRad = Math.min(0.32, Math.max(0.1, (c.altitudeKm / EARTH_RADIUS_KM) * 0.55));
    const focusCutoff = Math.cos(coneRad);

    this.wildPoints.visible = this.toggles.wildlifeMasks;
    if (this.toggles.wildlifeMasks)
      this.rebuildWildlifeMasks(wildSnap.groups, camDir, focusDir, limbCutoff, focusCutoff);

    this.villagePoints.visible = this.toggles.villageMasks;
    if (this.toggles.villageMasks)
      this.rebuildVillageMasks(treeSnap.villages, camDir, focusDir, limbCutoff, focusCutoff);

    this.footprintLines.visible = this.toggles.houseFootprints;
    if (this.toggles.houseFootprints) this.rebuildFootprints(treeSnap.lodgings);

    this.keepOutLines.visible = this.toggles.keepOuts;
    if (this.toggles.keepOuts)
      this.rebuildKeepOuts(wildSnap.keepOuts, camDir, focusDir, limbCutoff, focusCutoff);
  }

  private rebuildWildlifeMasks(
    groups: ReturnType<WildlifeLayer['debugSnapshot']>['groups'],
    camDir: THREE.Vector3,
    focusDir: Vec3,
    limbCutoff: number,
    focusCutoff: number,
  ): void {
    const near = groups
      .filter((g) => g.mask)
      .map((g) => {
        const d = this.ctx.globe.lens.toDrawn(latLonToDir(g.lat, g.lon));
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        return { g, dot: (d[0] * focusDir[0] + d[1] * focusDir[1] + d[2] * focusDir[2]) / len };
      })
      .filter((x) => x.dot > focusCutoff - 0.14)
      .sort((a, b) => b.dot - a.dot)
      .slice(0, MAX_WILD_MASKS);

    const pos: number[] = [];
    const col: number[] = [];
    const green = new THREE.Color(0x22c55e);
    const red = new THREE.Color(0xef4444);
    for (const { g } of near) {
      const wg = WILD_GROUPS[g.index]!;
      const origin = latLonToDir(g.lat, g.lon);
      for (let j = 0; j < WILD_MASK_N; j++) {
        for (let i = 0; i < WILD_MASK_N; i++) {
          const [ek, nk] = wildMaskCell(wg, i, j);
          const drawn = this.ctx.globe.lens.toDrawn(unitOffset(origin, ek, nk));
          const len = Math.hypot(drawn[0], drawn[1], drawn[2]) || 1;
          const dir: Vec3 = [drawn[0] / len, drawn[1] / len, drawn[2] / len];
          if (!inViewCone(dir, camDir, focusDir, limbCutoff, focusCutoff)) continue;
          const r = EARTH_RADIUS_KM + this.ctx.surface.surfaceKm(dir) + LIFT_MASK_KM;
          pos.push(dir[0] * r, dir[1] * r, dir[2] * r);
          const c = g.mask![j * WILD_MASK_N + i] ? green : red;
          col.push(c.r, c.g, c.b);
        }
      }
    }
    this.setPoints(this.wildPoints, pos, col);
  }

  private rebuildVillageMasks(
    villages: ReturnType<TreeLayer['debugSnapshot']>['villages'],
    camDir: THREE.Vector3,
    focusDir: Vec3,
    limbCutoff: number,
    focusCutoff: number,
  ): void {
    const near = villages
      .map((v) => {
        const d = this.ctx.globe.lens.toDrawn(latLonToDir(v.lat, v.lon));
        const len = Math.hypot(d[0], d[1], d[2]) || 1;
        return { v, dot: (d[0] * focusDir[0] + d[1] * focusDir[1] + d[2] * focusDir[2]) / len };
      })
      .filter((x) => x.dot > focusCutoff - 0.1)
      .sort((a, b) => b.dot - a.dot)
      .slice(0, 2);

    const pos: number[] = [];
    const col: number[] = [];
    const green = new THREE.Color(0x22c55e);
    const cyan = new THREE.Color(0x38bdf8);
    const red = new THREE.Color(0xef4444);
    for (const { v } of near) {
      const origin = latLonToDir(v.lat, v.lon);
      for (let rIdx = 0; rIdx < MASK_RINGS; rIdx++) {
        for (let sIdx = 0; sIdx < MASK_SECTORS; sIdx++) {
          const pt = maskCentre(rIdx, sIdx);
          const drawn = this.ctx.globe.lens.toDrawn(
            unitOffset(origin, pt.x * LAYOUT_KM_PER_M, pt.z * LAYOUT_KM_PER_M),
          );
          const len = Math.hypot(drawn[0], drawn[1], drawn[2]) || 1;
          const dir: Vec3 = [drawn[0] / len, drawn[1] / len, drawn[2] / len];
          if (!inViewCone(dir, camDir, focusDir, limbCutoff, focusCutoff)) continue;
          const r = EARTH_RADIUS_KM + this.ctx.surface.surfaceKm(dir) + LIFT_MASK_KM;
          pos.push(dir[0] * r, dir[1] * r, dir[2] * r);
          const dry = maskLand(v.fieldLand, pt.x, pt.z);
          const own = !v.fieldShare || maskLand(v.fieldShare, pt.x, pt.z);
          const c = !dry ? red : !own ? cyan : green;
          col.push(c.r, c.g, c.b);
        }
      }
    }
    this.setPoints(this.villagePoints, pos, col);
  }

  private rebuildFootprints(lodgings: DebugLodgingSnapshot[]): void {
    const pos: number[] = [];
    const col: number[] = [];
    const tmp = new THREE.Color();
    for (const l of lodgings) {
      const status = classifyGrounding(l.hoverGapKm, l.buryOverKm, l.reliefKm, l.plinthDepthKm);
      tmp.setHex(STATUS_HEX[status]);
      const pts = l.corners.map((dir) => {
        const r = EARTH_RADIUS_KM + this.ctx.surface.surfaceKm(dir) + LIFT_FOOTPRINT_KM;
        return [dir[0] * r, dir[1] * r, dir[2] * r] as const;
      });
      for (let i = 0; i < 4; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % 4]!;
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        col.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
      }
    }
    this.setLines(this.footprintLines, pos, col);
  }

  private rebuildKeepOuts(
    keepOuts: ReturnType<WildlifeLayer['debugSnapshot']>['keepOuts'],
    camDir: THREE.Vector3,
    focusDir: Vec3,
    limbCutoff: number,
    focusCutoff: number,
  ): void {
    const pos: number[] = [];
    const col: number[] = [];
    const orange = new THREE.Color(0xf97316);
    const yellow = new THREE.Color(0xfacc15);
    const addRing = (center: Vec3, radiusKm: number, c: THREE.Color) => {
      let prev: [number, number, number] | undefined;
      for (let i = 0; i <= RING_STEPS; i++) {
        const a = (i / RING_STEPS) * Math.PI * 2;
        const dir = unitOffset(center, Math.cos(a) * radiusKm, Math.sin(a) * radiusKm);
        const r = EARTH_RADIUS_KM + this.ctx.surface.surfaceKm(dir) + LIFT_RING_KM;
        const pt: [number, number, number] = [dir[0] * r, dir[1] * r, dir[2] * r];
        if (prev) {
          pos.push(prev[0], prev[1], prev[2], pt[0], pt[1], pt[2]);
          col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        }
        prev = pt;
      }
    };
    for (const k of keepOuts) {
      const td = latLonToDir(k.lat, k.lon);
      const dd = this.ctx.globe.lens.toDrawn(td);
      const len = Math.hypot(dd[0], dd[1], dd[2]) || 1;
      const nd: Vec3 = [dd[0] / len, dd[1] / len, dd[2] / len];
      if (!inViewCone(nd, camDir, focusDir, limbCutoff, focusCutoff)) continue;
      addRing(nd, k.km, orange);
    }
    for (const o of this.ctx.tree.obstacles()) {
      const od: Vec3 = [o.dir.x, o.dir.y, o.dir.z];
      if (!inViewCone(od, camDir, focusDir, limbCutoff, focusCutoff)) continue;
      addRing(od, o.km, yellow);
    }
    this.setLines(this.keepOutLines, pos, col);
  }

  private setPoints(obj: THREE.Points, pos: number[], col: number[]): void {
    obj.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    obj.geometry = g;
  }

  private setLines(obj: THREE.LineSegments, pos: number[], col: number[]): void {
    obj.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    obj.geometry = g;
  }
}
