// Draws the scene with MSAA 4× (spec milestone 1, section 11.2): the scene
// renders into a multisampled target that is then copied to the screen. The
// render scale from dynamic resolution sets the size of the drawing buffer.

import * as THREE from 'three';

const COPY_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`;
const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class FrameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private width = 1;
  private height = 1;
  private scale = 1;

  constructor(renderer: THREE.WebGLRenderer, samples = 4) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      samples,
      depthBuffer: true,
      type: THREE.UnsignedByteType,
    });
    const copy = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: COPY_FRAGMENT,
      uniforms: { tDiffuse: { value: this.target.texture } },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copy);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(width: number, height: number, scale: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.scale = scale;
    this.renderer.setPixelRatio(this.scale);
    this.renderer.setSize(this.width, this.height, false);
    this.target.setSize(this.pixelWidth, this.pixelHeight);
  }

  get pixelWidth(): number {
    return Math.round(this.width * this.scale);
  }

  get pixelHeight(): number {
    return Math.round(this.height * this.scale);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCamera);
  }
}
