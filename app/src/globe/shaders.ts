// Terrain, water and ice in one shader (spec milestone 1, sections 4.3, 4.4,
// 5.2). Water is drawn where the ocean mask says the sea reaches at the
// date's sea level, by lifting those vertices to the sea surface; ice lifts
// the surface by its thickness. The land colours are flat stand-ins until
// painted textures are approved (section 12).

export const terrainVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

attribute vec2 elev;   // height (m), sea level at which the sample joins the ocean (m)
attribute vec4 extra;  // lake, river, skirt, unused (0..1)
attribute vec2 ice;    // ice thickness at slice A and B (m)

uniform float seaLevel;
uniform float exaggeration;
uniform float iceT;
uniform float skirtDepth;
uniform float relief; // 0 in orbit (clean sphere), 1 below about 1,500 km

varying vec3 vWorld;
varying vec3 vUp;
varying vec3 vNormal;
varying float vWater;
varying float vIce;
varying float vHeight;
varying float vRiver;
varying float vLake;

void main() {
  vec4 world0 = modelMatrix * vec4(position, 1.0);
  vec3 up = normalize(world0.xyz);
  float h = elev.x;
  float oceanLevel = elev.y;
  float lake = extra.x;
  float iceM = mix(ice.x, ice.y, iceT);

  bool sea = lake < 0.5 && oceanLevel <= seaLevel && h < seaLevel;
  float surface = h;
  float water;
  if (lake > 0.5) {
    water = 4.0;
  } else if (sea) {
    water = seaLevel - h;
    surface = seaLevel;
  } else {
    water = -max(h - seaLevel, 1.0);
  }
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
  surface -= extra.z * skirtDepth;

  float lift = surface * exaggeration * 0.001 * relief;
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
  #include <logdepthbuf_vertex>
}
`;

export const terrainFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 sunDir;
uniform float alwaysDay;
uniform float glacial;
uniform float time;
uniform vec3 cameraWorld;
uniform float fogDistance;
uniform vec3 hazeColor;
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
  float v = noise3(vWorld * 0.05) * 0.6 + noise3(vWorld * 0.4) * 0.4;
  // Colder, drier ice age: climate bands move towards the equator.
  float coldLat = alat + glacial * 12.0;
  float dryBand = 1.0 - smoothstep(4.0 + glacial * 4.0, 9.0, abs(alat - 24.0));

  vec3 grass = vec3(0.43, 0.56, 0.25);
  vec3 forest = vec3(0.25, 0.42, 0.21);
  vec3 jungle = vec3(0.18, 0.40, 0.17);
  vec3 steppe = vec3(0.60, 0.56, 0.36);
  vec3 tundra = vec3(0.55, 0.55, 0.45);
  vec3 sand = vec3(0.84, 0.75, 0.52);
  vec3 rock = vec3(0.49, 0.45, 0.41);
  vec3 snow = vec3(0.95, 0.96, 0.98);

  vec3 c = grass;
  c = mix(c, forest, smoothstep(38.0, 46.0, coldLat) * (1.0 - smoothstep(56.0, 62.0, coldLat)) * (0.6 + 0.4 * v));
  c = mix(c, jungle, (1.0 - smoothstep(8.0, 14.0, alat + glacial * 6.0)) * (1.0 - glacial * 0.5));
  c = mix(c, steppe, smoothstep(56.0, 62.0, coldLat));
  c = mix(c, tundra, smoothstep(62.0, 68.0, coldLat));
  c = mix(c, sand, clamp(dryBand * (0.75 + glacial * 0.25) + (v - 0.5) * 0.3, 0.0, 1.0));
  c = mix(c, rock, smoothstep(0.25, 0.5, slope) + smoothstep(2500.0, 3500.0, vHeight) * 0.6);
  float snowLine = 4800.0 - smoothstep(20.0, 70.0, coldLat) * 4600.0;
  c = mix(c, snow, smoothstep(snowLine, snowLine + 400.0, vHeight + v * 300.0));
  return c * (0.88 + 0.24 * v);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 up = normalize(vUp);
  vec3 viewDir = normalize(cameraWorld - vWorld);
  vec3 light = alwaysDay > 0.5 ? viewDir : sunDir;
  float daylight = alwaysDay > 0.5 ? 1.0 : smoothstep(-0.12, 0.2, dot(up, sunDir));

  vec3 n = normalize(vNormal);
  vec3 albedo;
  float spec = 0.0;
  float shininess = 60.0;

  bool isWater = vWater > 0.0 && vIce <= 1.0;
  bool isRiver = !isWater && vIce <= 1.0 && vRiver > riverThreshold;
  if (isWater || isRiver) {
    float depth = isRiver ? 2.0 : vWater;
    vec3 shallow = vec3(0.30, 0.76, 0.75);
    vec3 deep = vec3(0.07, 0.25, 0.50);
    albedo = vLake > 0.5 || isRiver ? vec3(0.20, 0.47, 0.62) : mix(shallow, deep, smoothstep(0.0, 160.0, depth));
    n = up;
    if (waterDetail > 0.5) {
      float w = sin(dot(vWorld, vec3(3.1, 1.7, 2.3)) + time * 1.3) + sin(dot(vWorld, vec3(-1.9, 2.8, 1.1)) + time * 0.9);
      n = normalize(up + (vec3(sin(time + vWorld.x * 2.0), 0.0, cos(time * 0.8 + vWorld.z * 2.0)) * 0.02) * w);
    }
    if (waterDetail > 1.5) spec = 0.7;
    float foam = (1.0 - smoothstep(0.0, 3.0, depth)) * 0.55 * (vLake > 0.5 ? 0.3 : 1.0);
    albedo = mix(albedo, vec3(0.92, 0.96, 0.97), foam);
    shininess = 120.0;
  } else if (vIce > 1.0) {
    float edge = 1.0 - smoothstep(20.0, 300.0, vIce);
    albedo = mix(vec3(0.91, 0.95, 0.99), vec3(0.62, 0.80, 0.92), edge);
    spec = 0.25;
  } else {
    albedo = landColour(n, up);
  }

  float ndl = max(dot(n, light), 0.0);
  vec3 lit = albedo * (0.32 + 0.78 * ndl);
  if (spec > 0.0) {
    vec3 h = normalize(light + viewDir);
    lit += vec3(1.0, 0.97, 0.9) * pow(max(dot(n, h), 0.0), shininess) * spec;
  }
  vec3 night = albedo * vec3(0.16, 0.19, 0.30);
  vec3 colour = mix(night, lit, daylight);

  float dist = length(cameraWorld - vWorld);
  float fog = 1.0 - exp(-dist / fogDistance);
  colour = mix(colour, hazeColor * mix(0.25, 1.0, daylight), clamp(fog, 0.0, 0.85));
  gl_FragColor = vec4(colour, 1.0);
  #include <colorspace_fragment>
}
`;

export const atmosphereVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;

export const atmosphereFragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 cameraWorld;
uniform vec3 sunDir;
uniform float alwaysDay;
uniform float strength;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  #include <logdepthbuf_fragment>
  vec3 viewDir = normalize(vWorld - cameraWorld);
  float rim = pow(1.0 - abs(dot(vNormalW, viewDir)), 3.0);
  float day = alwaysDay > 0.5 ? 1.0 : smoothstep(-0.3, 0.3, dot(vNormalW, sunDir));
  vec3 c = vec3(0.35, 0.6, 1.0) * rim * (0.25 + 0.75 * day) * strength;
  gl_FragColor = vec4(c, rim * strength);
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const skyFragment = /* glsl */ `
uniform vec3 localUp;
uniform float daylight;
uniform float atmosphere; // 1 near the ground, 0 in space
varying vec3 vDir;
void main() {
  float e = dot(normalize(vDir), localUp);
  vec3 zenith = vec3(0.22, 0.45, 0.85);
  vec3 horizon = vec3(0.72, 0.83, 0.95);
  vec3 sky = mix(horizon, zenith, smoothstep(-0.05, 0.6, e));
  vec3 nightSky = vec3(0.02, 0.03, 0.08);
  vec3 space = vec3(0.005, 0.008, 0.02);
  vec3 c = mix(nightSky, sky, daylight);
  gl_FragColor = vec4(mix(space, c, atmosphere), 1.0);
  #include <colorspace_fragment>
}
`;
