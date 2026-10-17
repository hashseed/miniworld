// Terrain, water and ice in one shader (spec milestone 1, sections 4.3, 4.4,
// 5.2). Water is drawn where the ocean mask says the sea reaches at the
// date's sea level, by lifting those vertices to the sea surface; ice lifts
// the surface by its thickness, and land stands a fixed step above the sea
// so continents read as toy slabs (section 4.2). The look is a toy planet
// under studio lights (sections 3.6 and 4.3); the land colours are painted
// directly until textures are approved (section 12).

export const terrainVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

attribute vec2 elev;   // height (m), smoothed sea level at which the sample is sea (m)
attribute vec4 extra;  // lake field, river field, skirt, unused (0..1)
attribute vec2 flow;   // river flow phase as cosine and sine (-1..1)
attribute vec4 ice;    // ice thickness at slice A and B (m), aridity at A and B (0..1000)

uniform float seaLevel;
uniform float exaggeration;
uniform float iceT;
uniform float skirtDepth;
uniform float landLift; // metres every land vertex stands above its height

varying vec3 vWorld;
varying vec3 vUp;
varying vec3 vNormal;
varying float vWater;
varying float vIce;
varying float vHeight;
varying float vRiver;
varying float vLake;
varying float vSkirt;
varying float vArid;
varying vec2 vFlow;

void main() {
  vec4 world0 = modelMatrix * vec4(position, 1.0);
  vec3 up = normalize(world0.xyz);
  float h = elev.x;
  float oceanLevel = elev.y;
  float lake = extra.x;
  float iceM = mix(ice.x, ice.y, iceT);

  // Both the ocean level and the lake field are smooth, so the water signal
  // below crosses zero along smooth curves (sections 4.3 and 5.1).
  float seaWater = seaLevel - oceanLevel;
  float lakeWater = (lake - 0.5) * 80.0;
  bool sea = lake <= 0.5 && seaWater > 0.0;
  float surface = h;
  float water;
  if (lake > 0.5) {
    water = lakeWater;
  } else if (sea) {
    water = seaWater;
    surface = seaLevel;
  } else {
    water = max(seaWater, lakeWater);
  }
  // The smoothed coast can leave sea floor on the land side; it stands at sea level.
  if (!sea && lake <= 0.5) surface = max(surface, seaLevel);
  if (iceM > 1.0) {
    float top = h + iceM;
    if (sea && top < seaLevel + 1.0) {
      // Floating ice shelf: show a thin raised sheet on the sea.
      surface = seaLevel + min(iceM * 0.1, 80.0);
    } else {
      surface = max(surface, top);
    }
    water = min(water, -1.0);
  }
  // The lift ramps in over the first metres of the smoothed coast, so the
  // cliff follows the smooth coastline rather than the vertex grid.
  if (lake > 0.5 || surface > seaLevel + 80.0) surface += landLift;
  else if (!sea) surface += landLift * clamp(-water / 30.0, 0.0, 1.0);
  surface -= extra.z * skirtDepth;

  float lift = surface * exaggeration * 0.001;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.xyz += normalize(mat3(viewMatrix) * up) * lift;
  gl_Position = projectionMatrix * mv;

  vWorld = world0.xyz + up * lift;
  vUp = up;
  vNormal = normalize(normal);
  vWater = water;
  vIce = iceM;
  vHeight = h;
  vRiver = extra.y;
  vLake = lake;
  vSkirt = extra.z;
  vArid = mix(ice.z, ice.w, iceT) * 0.001;
  vFlow = flow;
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

varying vec3 vWorld;
varying vec3 vUp;
varying vec3 vNormal;
varying float vWater;
varying float vIce;
varying float vHeight;
varying float vRiver;
varying float vLake;
varying float vSkirt;
varying float vArid;
varying vec2 vFlow;

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

vec3 landColour(vec3 n, vec3 up) {
  float lat = degrees(asin(clamp(up.y, -1.0, 1.0)));
  float alat = abs(lat);
  float slope = 1.0 - clamp(dot(n, up), 0.0, 1.0);
  // Large soft patches, like painted clay, rather than fine speckle.
  float v = noise3(vWorld * 0.012) * 0.7 + noise3(vWorld * 0.05) * 0.3;
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
  c = mix(c, steppe, smoothstep(0.05, 0.4, vArid + (v - 0.5) * 0.2) * 0.7);
  c = mix(c, sand, smoothstep(0.45, 0.75, vArid + (v - 0.5) * 0.25));
  c = mix(c, rock, smoothstep(0.35, 0.6, slope) + smoothstep(2500.0, 3500.0, vHeight) * 0.6);
  float snowLine = 4800.0 - smoothstep(20.0, 70.0, coldLat) * 4600.0;
  c = mix(c, snow, smoothstep(snowLine, snowLine + 400.0, vHeight + v * 300.0));
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
const float ICE_EDGE = 60.0;

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
  vec3 smoothN = n;
  // The coast cliffs and ice edges are made in the vertex shader, so their
  // slope comes from the screen-space derivative of the surface.
  vec3 dn = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(dn, up) < 0.0) dn = -dn;
  float nearCoast = 1.0 - smoothstep(0.0, 400.0, abs(vWater));
  if (vSkirt < 0.5)
    n = normalize(mix(n, dn, smoothstep(0.25, 0.6, 1.0 - dot(dn, up)) * nearCoast));
  vec3 albedo;

  // Ice starts at ICE_EDGE metres of interpolated thickness, so its border is a
  // smooth curve rather than the staircase of the vertex grid.
  bool hasIce = vIce > ICE_EDGE;
  bool isWater = vWater > 0.0 && !hasIce;
  bool isRiver = !isWater && !hasIce && vRiver > riverThreshold;
  if (isWater || isRiver) {
    // One glossy sea colour, with no shallows (section 4.4).
    albedo = vLake > 0.5 || isRiver ? vec3(0.24, 0.62, 0.92) : vec3(0.08, 0.44, 0.86);
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
    float edge = 1.0 - smoothstep(20.0, 400.0, vIce);
    albedo = mix(vec3(0.97, 0.99, 1.0), vec3(0.62, 0.84, 0.97), edge);
  } else {
    albedo = landColour(smoothN, up);
  }

  vec3 colour = studio(albedo, n, viewDir);
  // Ink outlines: the globe's silhouette, coastlines, river banks and ice edges.
  // The water and ice fields are clamped so the lines keep an even width.
  float ink = inkLine(min(dot(up, viewDir), 0.25), 0.0, 5.0);
  // No coast line across a river mouth.
  if (vRiver < riverThreshold) ink = max(ink, inkLine(clamp(vWater, -30.0, 30.0), 0.0, 1.6));
  ink = max(ink, inkLine(clamp(vIce, 0.0, ICE_EDGE * 2.0), ICE_EDGE, 1.6));
  if (!isWater && !hasIce) ink = max(ink, inkLine(vRiver, riverThreshold, 1.4));
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
