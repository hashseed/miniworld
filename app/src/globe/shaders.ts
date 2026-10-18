// Terrain, water and ice in one shader (spec milestone 1, sections 4.3, 4.4,
// 5.2). Water is drawn where the ocean mask says the sea reaches at the
// date's sea level, by lifting those vertices to the sea surface; ice sheets
// are smooth domes over the ice cover, and land stands a fixed step above the sea
// so continents read as toy slabs (section 4.2). The look is a toy planet
// under studio lights (sections 3.6 and 4.3); the land colours are painted
// directly until textures are approved (section 12).

import { ICE_DISTANCE_STEP_KM, ICE_DISTANCE_ZERO, TERRAIN_SAMPLES } from '../content/formats.ts';
import { LENS_COLS, LENS_ROWS, LENS_STEP } from './lens.ts';

/**
 * The history lens in GLSL (history-lens.md, section 4): the forward grid
 * read with the same bilinear lookup as lens.ts, blended with the identity.
 */
const lensChunk = /* glsl */ `
uniform sampler2D lensGrid; // drawn direction (xyz) and width factor (w) per grid point
uniform float lensBlend;    // 0 true sizes .. 1 full lens
uniform float earthRadius;

vec4 lensAt(vec3 d) {
  if (lensBlend <= 0.0) return vec4(d, 1.0);
  float lat = degrees(asin(clamp(d.y, -1.0, 1.0)));
  float lon = degrees(atan(d.x, d.z));
  vec2 f = clamp(
    vec2((lon + 180.0) / ${LENS_STEP}.0, (lat + 90.0) / ${LENS_STEP}.0),
    vec2(0.0),
    vec2(${LENS_COLS}.0 - 1.0001, ${LENS_ROWS}.0 - 1.0001));
  ivec2 i = ivec2(floor(f));
  vec2 t = f - vec2(i);
  vec4 a = texelFetch(lensGrid, i, 0);
  vec4 b = texelFetch(lensGrid, i + ivec2(1, 0), 0);
  vec4 c = texelFetch(lensGrid, i + ivec2(0, 1), 0);
  vec4 e = texelFetch(lensGrid, i + ivec2(1, 1), 0);
  vec4 m = mix(mix(a, b, t.x), mix(c, e, t.x), t.y);
  vec3 drawn = normalize(mix(d, normalize(m.xyz), lensBlend));
  return vec4(drawn, mix(1.0, m.w, lensBlend));
}

/** Rotates v by the rotation that takes unit vector a to unit vector b. */
vec3 rotateTo(vec3 v, vec3 a, vec3 b) {
  vec3 k = cross(a, b);
  float s2 = dot(k, k);
  if (s2 < 1e-12) return v;
  float c = dot(a, b);
  return v * c + cross(k, v) + k * dot(k, v) * ((1.0 - c) / s2);
}
`;

/**
 * The date's ice and deserts from the two global climate slices around it
 * (section 5.2), blended by climateT: the signed distance from the ice
 * border in km (positive inside) and the aridity from 0 to 1.
 */
const climateGlsl = /* glsl */ `
uniform sampler2D climateA;
uniform sampler2D climateB;
uniform float climateT;
vec2 climateAt(vec3 up) {
  float lon = atan(up.x, up.z);
  float lat = asin(clamp(up.y, -1.0, 1.0));
  vec2 uv = vec2(lon * 0.15915494 + 0.5, 0.5 - lat * 0.31830989);
  vec2 c = mix(texture2D(climateA, uv).rg, texture2D(climateB, uv).rg, climateT);
  return vec2((c.r * 255.0 - ${ICE_DISTANCE_ZERO}.0) * ${ICE_DISTANCE_STEP_KM}.0, c.g);
}
`;

export const terrainVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

attribute vec3 elev;   // height (m), smoothed sea level at which the sample is sea (dm), smoothed bed (m)
attribute vec4 extra;  // lake field, river field, skirt, km from today's coast / 255
attribute vec2 flow;   // river flow phase as cosine and sine (-1..1)
attribute vec2 fieldUv; // texel centre of this sample in the tile's field texture

uniform float seaLevel;
uniform float exaggeration;
${climateGlsl}
uniform float skirtDepth;
uniform float landLift; // metres every land vertex stands above its height
${lensChunk}

// How far below the sea level the flat sea surface lies (section 4.4).
const float SEA_DROP = 3.0;
// Ice sheets rise from their border as smooth domes, ICE_DOME_M at most,
// reaching 63% of it ICE_DOME_KM inside; the relief under them is hidden
// over the first ICE_HIDE_KM (section 5.2).
const float ICE_DOME_M = 1200.0;
const float ICE_DOME_KM = 250.0;
const float ICE_HIDE_KM = 120.0;
// Near the sea, land may rise at most coastCap(d) metres at d km from today's
// coast (after a flat beach), so at 100x relief every coast and ice margin is
// a rounded clay edge rather than a wall; further inland the cap grows fast
// enough to leave mountains alone (section 4.4).
const float COAST_BEACH_KM = 2.0;
const float COAST_SLOPE = 12.0; // m per km at the coast
const float COAST_CURVE = 0.15; // extra m per km²

varying vec3 vWorld;
varying vec3 vUp;
varying vec3 vTrueUp;
varying vec3 vPattern;
varying vec3 vNormal;
varying float vWater;
varying float vHeight;
varying float vRiver;
varying float vLake;
varying float vSkirt;
varying vec2 vFlow;
varying vec2 vFieldUv;

void main() {
  vec4 world0 = modelMatrix * vec4(position, 1.0);
  vec3 up = normalize(world0.xyz);
  float h = elev.x;
  float oceanLevel = elev.y * 0.1; // stored in decimetres
  float lake = extra.x;
  float iceKm = climateAt(up).x;

  // Both the ocean level and the lake field are smooth, so the water signal
  // below crosses zero along smooth curves (sections 4.3 and 5.1). Where the
  // sea reaches a lake basin, it is sea.
  float seaWater = seaLevel - oceanLevel;
  float lakeWater = (lake - 0.5) * 80.0;
  bool sea = seaWater > 0.0;
  bool isLake = !sea && lake > 0.5;
  float water = sea ? seaWater : isLake ? lakeWater : max(seaWater, lakeWater);
  float surface = h;
  if (sea) {
    // The terrain's sea is left out; the flat sea surface lies just below
    // (section 4.4), so coast triangles never dip under it on the land side.
    surface = seaLevel;
  } else if (!isLake) {
    // The smoothed coast can leave sea floor on the land side.
    surface = max(surface, seaLevel);
  }
  if (!sea) {
    surface += landLift;
    // Rounded clay edge: the rise above the sea (relief and lift together)
    // is softly capped by the distance from the coast, so coasts slope down
    // to the sea instead of standing as walls (section 4.2).
    float d = max(extra.w * 255.0 - COAST_BEACH_KM, 0.0);
    float cap = d * (COAST_SLOPE + COAST_CURVE * d) + 1e-3;
    float rise = max(surface - seaLevel, 0.0);
    float q = rise / cap;
    surface = seaLevel + rise * inversesqrt(sqrt(1.0 + q * q * q * q));
  }
  float sheet = smoothstep(0.0, ICE_HIDE_KM, iceKm);
  if (sheet > 0.0) {
    // The ice sheets are smooth domes on the smoothed bed, rising from their
    // border, so they hide the relief and meet sea and land without walls.
    float dome = ICE_DOME_M * (1.0 - exp(-iceKm / ICE_DOME_KM));
    float top = max(elev.z, seaLevel) + landLift + dome;
    surface = mix(surface, top, sheet);
    water = min(water, -1.0);
  }
  surface -= extra.z * skirtDepth;
#ifdef SEA_SURFACE
  surface = seaLevel - SEA_DROP;
#endif

  // The history lens moves the vertex to its drawn position and scales its
  // relief with the local width (history-lens.md, section 4).
  vec4 lens = lensAt(up);
  vec3 drawnUp = lens.xyz;
  float lift = surface * exaggeration * 0.001;
  vec3 offset = (drawnUp - up) * earthRadius + drawnUp * (lift * lens.w);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.xyz += mat3(viewMatrix) * offset;
  gl_Position = projectionMatrix * mv;

  vWorld = world0.xyz + offset;
  vUp = drawnUp;
  vTrueUp = up;
  // Painted patterns stay fixed to the land while it morphs.
  vPattern = world0.xyz + up * lift;
  vNormal = rotateTo(normalize(normal), up, drawnUp);
  vWater = water;
  vHeight = h;
  vRiver = extra.y;
  vLake = lake;
  vSkirt = extra.z;
  vFlow = flow;
  vFieldUv = fieldUv;
  #include <logdepthbuf_vertex>
}
`;

export const terrainFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 lightDir; // key light, follows the camera (section 3.6)
uniform vec3 screenUp; // camera up, for the sky fill from above
uniform float glacial;
uniform float time;
uniform vec3 cameraWorld;
uniform float riverThreshold;
uniform float waterDetail; // 0 low, 1 medium, 2 high
uniform float seaLevel;
uniform sampler2D fields; // ocean level (m), lake field, river field per tile sample
${climateGlsl}

varying vec3 vWorld;
varying vec3 vUp;
varying vec3 vTrueUp;
varying vec3 vPattern;
varying vec3 vNormal;
varying float vWater;
varying float vHeight;
varying float vRiver;
varying float vLake;
varying float vSkirt;
varying vec2 vFlow;
varying vec2 vFieldUv;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}

vec3 landColour(vec3 n, vec3 up, float arid) {
  // Climate follows the true latitude, not the drawn one.
  float lat = degrees(asin(clamp(normalize(vTrueUp).y, -1.0, 1.0)));
  float alat = abs(lat);
  float slope = 1.0 - clamp(dot(n, up), 0.0, 1.0);
  // Large soft patches, like painted clay, rather than fine speckle.
  float v = noise3(vPattern * 0.012) * 0.7 + noise3(vPattern * 0.05) * 0.3;
  // Colder, drier ice age: climate bands move towards the equator.
  float coldLat = alat + glacial * 12.0;

  vec3 grass = vec3(0.47, 0.74, 0.26);
  vec3 forest = vec3(0.21, 0.56, 0.24);
  vec3 jungle = vec3(0.10, 0.54, 0.25);
  vec3 steppe = vec3(0.88, 0.74, 0.36);
  vec3 tundra = vec3(0.70, 0.72, 0.50);
  vec3 sand = vec3(0.97, 0.63, 0.29);
  vec3 rock = vec3(0.66, 0.53, 0.45);
  vec3 snow = vec3(0.98, 0.98, 1.0);

  vec3 c = grass;
  c = mix(c, forest, smoothstep(38.0, 46.0, coldLat) * (1.0 - smoothstep(56.0, 62.0, coldLat)) * (0.6 + 0.4 * v));
  c = mix(c, jungle, (1.0 - smoothstep(8.0, 14.0, alat + glacial * 6.0)) * (1.0 - glacial * 0.5));
  c = mix(c, steppe, smoothstep(56.0, 62.0, coldLat));
  c = mix(c, tundra, smoothstep(62.0, 68.0, coldLat));
  // Deserts come from the desert model, which follows their wet and dry phases.
  c = mix(c, steppe, smoothstep(0.05, 0.4, arid + (v - 0.5) * 0.2) * 0.7);
  c = mix(c, sand, smoothstep(0.45, 0.75, arid + (v - 0.5) * 0.25));
  // Mountains turn to rock towards the snow line and carry glacier caps on
  // their steep tops (section 4.3). The line follows the smoothed heights:
  // about 4600 m in the tropics, falling to 1000 m towards the poles and in
  // the ice age. Flat high plateaus such as Tibet stay bare.
  float snowLine = max(1000.0, 4600.0 - smoothstep(15.0, 60.0, coldLat) * 3800.0);
  float alpine = smoothstep(snowLine - 1000.0, snowLine - 300.0, vHeight + v * 200.0);
  c = mix(c, rock, clamp(smoothstep(0.35, 0.6, slope) + alpine * 0.85, 0.0, 1.0));
  float peak = max(smoothstep(0.07, 0.16, slope), smoothstep(snowLine + 2000.0, snowLine + 2500.0, vHeight));
  c = mix(c, snow, smoothstep(snowLine, snowLine + 250.0, vHeight + v * 300.0) * peak);
  return c * (0.93 + 0.14 * v);
}

/** One octave of the cartoon sea pattern: drifting ripple bands and popping crests. */
float waveLayer(vec3 p, float scale, float t) {
  vec3 q = p / scale;
  float warp = noise3(q * 0.35) * 6.0;
  float band = sin(q.x * 1.3 + q.z * 0.9 + q.y * 0.7 + warp + t * 0.6);
  float lines = smoothstep(0.84, 0.97, band) * 0.55;
  vec3 c = q * 0.8;
  vec3 cell = floor(c);
  vec3 f = fract(c) - 0.5;
  float h = hash3(cell);
  vec3 off = vec3(hash3(cell + 1.7), hash3(cell + 3.1), hash3(cell + 5.3)) - 0.5;
  float life = 0.5 + 0.5 * sin(t * 1.1 + h * 6.2832);
  float crest = (1.0 - smoothstep(0.08, 0.15, length(f - off * 0.6))) * step(0.75, h) * life;
  return max(lines, crest);
}

const vec3 INK = vec3(0.23, 0.15, 0.11);

const float FIELD_SIZE = ${TERRAIN_SAMPLES}.0;

/** Cubic B-spline weights for a fractional position. */
vec4 bsplineWeights(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0);
}

/**
 * The tile's water fields with a cubic B-spline filter from four bilinear
 * taps, so coasts, lake shores and river banks are smooth curves at every
 * zoom instead of following the triangles (sections 4.3 and 5.1).
 */
vec3 waterFields(vec2 uv) {
  vec2 p = uv * FIELD_SIZE - 0.5;
  vec2 f = fract(p);
  p -= f;
  vec4 xw = bsplineWeights(f.x);
  vec4 yw = bsplineWeights(f.y);
  vec4 c = p.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xw.xz + xw.yw, yw.xz + yw.yw);
  vec4 o = (c + vec4(xw.yw, yw.yw) / s) / FIELD_SIZE;
  vec3 s0 = texture2D(fields, o.xz).rgb;
  vec3 s1 = texture2D(fields, o.yz).rgb;
  vec3 s2 = texture2D(fields, o.xw).rgb;
  vec3 s3 = texture2D(fields, o.yw).rgb;
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

/** Cel steps: three flat light bands with narrow soft edges (section 3.6). */
float cel(float x) {
  return 0.5 * (smoothstep(0.27, 0.31, x) + smoothstep(0.6, 0.64, x));
}

/** Ink line where a varying crosses a value, about px pixels wide. */
float inkLine(float v, float at, float px) {
  float w = max(fwidth(v), 1e-4) * px;
  return 1.0 - smoothstep(w * 0.5, w, abs(v - at));
}

/** Cel-shaded studio light: stepped key, sky fill from above, warm bounce from below, rim. No highlights or sun reflections (section 3.6). */
vec3 studio(vec3 albedo, vec3 n, vec3 viewDir) {
  float wrap = clamp((dot(n, lightDir) + 0.45) / 1.45, 0.0, 1.0);
  float fillT = dot(n, screenUp) * 0.5 + 0.5;
  vec3 fill = mix(vec3(0.42, 0.30, 0.24), vec3(0.30, 0.36, 0.48), fillT);
  vec3 c = albedo * (vec3(1.0, 0.96, 0.9) * (0.25 + 0.6 * cel(wrap)) + fill);
  float rim = smoothstep(0.62, 0.66, 1.0 - clamp(dot(n, viewDir), 0.0, 1.0)) * (1.0 - cel(wrap) * 0.7);
  c += vec3(1.0, 0.95, 0.92) * rim * 0.22;
  return c;
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 up = normalize(vUp);
  vec3 viewDir = normalize(cameraWorld - vWorld);

  vec3 n = normalize(vNormal);
#ifdef SEA_SURFACE
  n = up;
#endif
  vec3 smoothN = n;
  // The coast cliffs and ice edges are made in the vertex shader, so their
  // slope comes from the screen-space derivative of the surface.
  vec3 dn = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(dn, up) < 0.0) dn = -dn;
  float nearCoast = 1.0 - smoothstep(0.0, 400.0, abs(vWater));
  if (vSkirt < 0.5)
    n = normalize(mix(n, dn, smoothstep(0.25, 0.6, 1.0 - dot(dn, up)) * nearCoast));
  vec3 albedo;

  // The ice border is where the blended distance crosses zero, per pixel, so
  // it is a smooth curve. The sea surface has no ice of its own: its coarse
  // grid would draw stepped edges, and the ice belongs to the terrain.
  vec2 clim = climateAt(normalize(vTrueUp));
#ifdef SEA_SURFACE
  float iceKm = -100.0;
#else
  float iceKm = clim.x;
#endif
  bool hasIce = iceKm > 0.0;
  // The same water signal as the vertex shader, from the smooth fields.
  vec3 wf = waterFields(vFieldUv);
  float lakeF = wf.y;
  float riverF = wf.z;
  float seaW = seaLevel - wf.x;
  float lakeW = (lakeF - 0.5) * 80.0;
  float water = seaW > 0.0 ? seaW : lakeF > 0.5 ? lakeW : max(seaW, lakeW);
  bool isWater = water > 0.0 && !hasIce;
#ifndef SEA_SURFACE
  // The sea is the flat sea surface's (section 4.4); the terrain leaves it out.
  if (isWater && seaW > 0.0) discard;
#endif
  bool isRiver = !isWater && !hasIce && riverF > riverThreshold;
  // Arctic pack ice (section 5.2): the sea north of a wobbly edge near 78°N
  // today, reaching 70°N at the glacial maximum.
  float lat = degrees(asin(clamp(normalize(vTrueUp).y, -1.0, 1.0)));
  float packEdge = mix(78.0, 70.0, glacial) + (noise3(vPattern * 0.004) - 0.5) * 4.0;
  bool isPack = isWater && seaW > 0.0 && lat > packEdge;
  if (isPack) {
    albedo = mix(vec3(0.93, 0.97, 1.0), vec3(0.78, 0.9, 0.98), smoothstep(1.5, 0.0, lat - packEdge));
    n = up;
  } else if (isWater || isRiver) {
    // One glossy sea colour, with no shallows (section 4.4).
    albedo = seaW <= 0.0 || isRiver ? vec3(0.24, 0.62, 0.92) : vec3(0.08, 0.44, 0.86);
    n = up;
    if (waterDetail > 0.5) {
      float w = sin(dot(vWorld, vec3(3.1, 1.7, 2.3)) + time * 1.3) + sin(dot(vWorld, vec3(-1.9, 2.8, 1.1)) + time * 0.9);
      n = normalize(up + (vec3(sin(time + vWorld.x * 2.0), 0.0, cos(time * 0.8 + vWorld.z * 2.0)) * 0.02) * w);
    }
    // Cartoon waves on the sea and the large lakes (section 4.4), in world space, at a scale that follows the distance.
    if (!isRiver) {
      float t = waterDetail > 0.5 ? time : 0.0;
      float lod = log2(max(length(cameraWorld - vWorld), 1.0) / 40.0);
      float l0 = floor(lod);
      float s0 = pow(2.0, l0);
      float mark = mix(waveLayer(vWorld, s0, t), waveLayer(vWorld, s0 * 2.0, t), lod - l0);
      albedo = mix(albedo, vec3(0.86, 0.95, 1.0), mark * 0.75);
    }
    // Pulses flowing down the river towards its mouth (section 4.3).
    if (isRiver) {
      float t = waterDetail > 0.5 ? time * 0.8 : 0.0;
      float pulse = dot(vFlow, vec2(cos(t), -sin(t)));
      albedo = mix(albedo, vec3(0.78, 0.92, 1.0), smoothstep(0.2, 1.0, pulse) * 0.5);
    }
    // Glossy plastic sheen towards the globe's edge.
    float sheen = pow(1.0 - clamp(dot(up, viewDir), 0.0, 1.0), 2.5);
    albedo = mix(albedo, vec3(0.55, 0.82, 1.0), sheen * 0.55);
  } else if (hasIce) {
    // Plain ice, shaded by its own smooth surface rather than the relief below.
    n = normalize(up + dn);
    float edge = 1.0 - smoothstep(0.0, 60.0, iceKm);
    albedo = mix(vec3(0.97, 0.99, 1.0), vec3(0.78, 0.9, 0.98), edge);
  } else {
    albedo = landColour(smoothN, up, clim.y);
  }

  vec3 colour = studio(albedo, n, viewDir);
  // Ink outlines: the globe's silhouette, coastlines, river banks and ice edges.
  // The water and ice fields are clamped so the lines keep an even width.
  float ink = inkLine(min(dot(up, viewDir), 0.25), 0.0, 5.0);
  // No coast line across a river mouth.
  if (riverF < riverThreshold && !hasIce) ink = max(ink, inkLine(clamp(water, -30.0, 30.0), 0.0, 1.6));
  ink = max(ink, inkLine(clamp(iceKm, -30.0, 30.0), 0.0, 1.6));
  if (isWater && seaW > 0.0) ink = max(ink, inkLine(clamp(lat - packEdge, -1.0, 1.0), 0.0, 1.6));
  if (!isWater && !hasIce) ink = max(ink, inkLine(riverF, riverThreshold, 1.4));
  if (vSkirt > 0.5) ink = 0.0;
  colour = mix(colour, INK, ink * 0.85);
  gl_FragColor = vec4(colour, 1.0);
  #include <colorspace_fragment>
}
`;

export const cloudVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;

export const cloudFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 lightDir;
uniform vec3 screenUp;
uniform vec3 cameraWorld;
uniform float fade; // 1 fully drawn, 0 gone
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  #include <logdepthbuf_fragment>
  // Screen-door fade keeps the clouds opaque and in one batch.
  vec2 p = floor(gl_FragCoord.xy);
  float d = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  if (d > fade) discard;
  vec3 n = normalize(vNormalW);
  vec3 viewDir = normalize(cameraWorld - vWorld);
  float wrap = clamp((dot(n, lightDir) + 0.6) / 1.6, 0.0, 1.0);
  float lit = 0.5 * (smoothstep(0.3, 0.34, wrap) + smoothstep(0.62, 0.66, wrap));
  vec3 fill = mix(vec3(0.62, 0.55, 0.62), vec3(0.62, 0.70, 0.86), dot(n, screenUp) * 0.5 + 0.5);
  vec3 c = vec3(1.0) * (0.2 + lit * 0.4 + fill * 0.6);
  // Ink outline round each ball, about 3 pixels wide.
  float ndv = dot(n, viewDir);
  float w = max(fwidth(ndv), 1e-4) * 3.0;
  float ink = 1.0 - smoothstep(w * 0.5, w, ndv);
  c = mix(min(c, vec3(1.0)), vec3(0.23, 0.15, 0.11), ink * 0.85);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vDir;
varying vec3 vView;
void main() {
  vDir = normalize(position);
  vView = mat3(viewMatrix) * position;
  vec4 p = projectionMatrix * vec4(vView, 1.0);
  gl_Position = p.xyww;
}
`;

export const skyFragment = /* glsl */ `
uniform mat4 projectionMatrix;
uniform vec3 localUp;
uniform float atmosphere; // 1 near the ground, 0 in space
varying vec3 vDir;
varying vec3 vView;
void main() {
  float e = dot(normalize(vDir), localUp);
  vec3 zenith = vec3(0.45, 0.68, 0.95);
  vec3 horizon = vec3(0.82, 0.90, 0.98);
  vec3 sky = mix(horizon, zenith, smoothstep(-0.05, 0.6, e));
  // Studio backdrop: warm peach at the bottom of the screen to lilac and sky blue at the top.
  vec4 clip = projectionMatrix * vec4(vView, 1.0);
  float y = clamp(clip.y / clip.w * 0.5 + 0.5, 0.0, 1.0);
  vec3 backdrop = mix(vec3(1.0, 0.86, 0.76), vec3(0.89, 0.85, 0.96), smoothstep(0.0, 0.55, y));
  backdrop = mix(backdrop, vec3(0.76, 0.87, 0.98), smoothstep(0.55, 1.0, y));
  gl_FragColor = vec4(mix(backdrop, sky, atmosphere), 1.0);
  #include <colorspace_fragment>
}
`;
