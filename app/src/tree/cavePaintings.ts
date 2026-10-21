// The paintings of caves at anchors (humankind.md section 8.2): a fresh reconstruction of
// each painting, made from a photograph or tracing by tools/cave-art.mjs, drawn as a picture
// on the cut hill's rock face. Its texture's alpha is the pigment and its red channel the
// session (stage, times 40) each part is painted in, so the painting grows stage by stage.

import * as THREE from 'three';
import { drawable } from '../content/assets.ts';

/** Each painting's texture, colour and size on the face in life-size model metres, centred, from its foot. */
const PAINTINGS: Record<
  string,
  { texture: string; colour: string; width: number; height: number; foot: number }
> = {
  'prop-cave-wall-chauvet': {
    texture: 'cave-chauvet',
    colour: '#1b1715',
    width: 1.9,
    height: 1.5,
    foot: 0.15,
  },
  'prop-cave-wall-sulawesi': {
    texture: 'cave-leang-karampuang',
    colour: '#a3361f',
    width: 3.3,
    height: 1.35,
    foot: 0.3,
  },
};
/** A painting is painted in this many sessions (PAINT_SESSIONS in treeScene.ts). */
const STAGES = 6;

const vertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;
const fragment = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform vec3 colour;
uniform float built;
uniform float fade;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(map, vUv);
  float stage = floor(t.r * 255.0 / 40.0 + 0.5);
  // A part shows as its session paints it: over the session's share of the whole.
  float shown = clamp(built * ${STAGES.toFixed(1)} - stage, 0.0, 1.0);
  float a = t.a * shown * fade;
  if (a < 0.03) discard;
  gl_FragColor = vec4(colour, a);
}
`;

export class CavePaintings {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>();
  private used = new Set<string>();
  private loader = new THREE.TextureLoader();

  begin(): void {
    this.used.clear();
  }

  /** Draws a cave's painting at the face, `root` the cave's placement (as its prop), painted `built` of the way. */
  add(kind: string, root: THREE.Matrix4, built: number, fade = 1): void {
    const p = PAINTINGS[kind];
    if (!p || !drawable.has(`texture-${p.texture}`)) return;
    let mesh = this.meshes.get(kind);
    if (!mesh) {
      const texture = this.loader.load(`${import.meta.env.BASE_URL}textures/${p.texture}.png`);
      texture.colorSpace = THREE.NoColorSpace;
      texture.premultiplyAlpha = false;
      const material = new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          map: { value: texture },
          colour: { value: new THREE.Color(p.colour) },
          built: { value: 0 },
          fade: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const geometry = new THREE.PlaneGeometry(p.width, p.height);
      // In front of the face, its foot above the lowered ground.
      geometry.translate(0, p.foot + p.height / 2, 0.05);
      // Turned as the tree's props are (figures.ts, turned): model +Z along the placement's facing.
      geometry.rotateY(Math.PI / 2);
      mesh = new THREE.Mesh(geometry, material);
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
    mesh.matrix.copy(root);
    mesh.material.uniforms.built!.value = built;
    mesh.material.uniforms.fade!.value = fade;
    this.used.add(kind);
  }

  end(): void {
    for (const [kind, mesh] of this.meshes) mesh.visible = this.used.has(kind);
  }
}
