// Shaders of the geo-history globe (geo-history.md, section 5.2). Every moving
// piece looks its pose up in a one-row texture of quaternions, one texel per
// plate (and per half-stage ridge), so scrubbing time only rewrites that row.

const COMMON = /* glsl */ `
uniform sampler2D uPoses;
uniform float uAge;
uniform float uRadius;
vec3 rotateQ(vec4 q, vec3 v) {
  vec3 t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}
vec4 poseOf(float slot) {
  return texelFetch(uPoses, ivec2(int(slot + 0.5), 0), 0);
}
bool aliveAt(vec2 life) {
  return uAge <= life.x && uAge >= life.y;
}
`;

export const landVertex = /* glsl */ `
${COMMON}
attribute float poseSlot;
attribute vec2 life;
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vec3 d = rotateQ(poseOf(poseSlot), position);
  vDir = d;
  vec4 world = vec4(d * uRadius * 1.0004, 1.0);
  vWorld = world.xyz;
  gl_Position = aliveAt(life) ? projectionMatrix * viewMatrix * world : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

export const landFragment = /* glsl */ `
uniform sampler2D uClimate;
uniform vec3 uLight;
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vDir);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  vec3 base = texture2D(uClimate, vec2(abs(lat) / 1.5707963, 0.5)).rgb;
  float lit = 0.6 + 0.4 * max(dot(n, uLight), 0.0);
  gl_FragColor = vec4(base * lit, 1.0);
}
`;

export const oceanVertex = /* glsl */ `
varying vec3 vN;
void main() {
  vN = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const oceanFragment = /* glsl */ `
uniform vec3 uLight;
varying vec3 vN;
void main() {
  float d = max(dot(normalize(vN), uLight), 0.0);
  vec3 deep = vec3(0.10, 0.27, 0.52);
  vec3 lit = vec3(0.17, 0.42, 0.72);
  gl_FragColor = vec4(mix(deep, lit, d), 1.0);
}
`;

/** Lines drawn as quads of a fixed width in pixels. */
export const lineVertex = /* glsl */ `
${COMMON}
attribute vec3 posA;
attribute vec3 posB;
attribute float endSel;
attribute float side;
attribute float poseSlot;
attribute vec2 life;
uniform vec2 uViewport;
uniform float uWidth;
uniform float uRaise;
void main() {
  vec4 q = poseOf(poseSlot);
  vec3 a = rotateQ(q, posA) * uRadius * uRaise;
  vec3 b = rotateQ(q, posB) * uRadius * uRaise;
  vec4 ca = projectionMatrix * viewMatrix * vec4(a, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(b, 1.0);
  vec2 sa = ca.xy / ca.w * uViewport * 0.5;
  vec2 sb = cb.xy / cb.w * uViewport * 0.5;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec4 c = endSel < 0.5 ? ca : cb;
  vec2 offset = nrm * side * uWidth * 0.5 / (uViewport * 0.5);
  gl_Position = aliveAt(life) ? vec4(c.xy + offset * c.w, c.z, c.w) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

export const lineFragment = /* glsl */ `
uniform vec3 uColour;
uniform float uOpacity;
void main() {
  gl_FragColor = vec4(uColour, uOpacity);
}
`;

/** Teeth of subduction zones: small triangles standing off the line on one side. */
export const toothVertex = /* glsl */ `
${COMMON}
attribute vec3 normalDir;
attribute float apex;
attribute float poseSlot;
attribute vec2 life;
uniform float uTooth;
uniform float uRaise;
void main() {
  vec3 p = normalize(position + normalDir * apex * uTooth);
  vec3 d = rotateQ(poseOf(poseSlot), p) * uRadius * uRaise;
  gl_Position = aliveAt(life) ? projectionMatrix * viewMatrix * vec4(d, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;
