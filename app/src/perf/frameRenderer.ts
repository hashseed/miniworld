// Draws the scene with the tier's anti-aliasing (spec milestone 1, section
// 11.2): MSAA renders into a multisampled target, FXAA into a plain target
// followed by an FXAA pass, and "none" straight to the screen. The render
// scale from dynamic resolution sets the size of the drawing buffer.

import * as THREE from 'three';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { TierSettings } from './quality.ts';

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
  private mode: TierSettings['antialias'] = 'none';
  private target: THREE.WebGLRenderTarget | undefined;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private copyMaterial: THREE.ShaderMaterial;
  private fxaaMaterial: THREE.ShaderMaterial;
  private width = 1;
  private height = 1;
  private scale = 1;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.copyMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: COPY_FRAGMENT,
      uniforms: { tDiffuse: { value: null } },
      depthTest: false,
      depthWrite: false,
    });
    this.fxaaMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: FXAAShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setMode(mode: TierSettings['antialias']): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.target?.dispose();
    this.target = undefined;
    if (mode !== 'none') {
      this.target = new THREE.WebGLRenderTarget(1, 1, {
        samples: mode === 'msaa' ? 4 : 0,
        depthBuffer: true,
        type: THREE.UnsignedByteType,
      });
    }
    this.resize();
  }

  setSize(width: number, height: number, scale: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.scale = scale;
    this.resize();
  }

  get pixelWidth(): number {
    return Math.round(this.width * this.scale);
  }

  get pixelHeight(): number {
    return Math.round(this.height * this.scale);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const r = this.renderer;
    if (!this.target) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    const material = this.mode === 'fxaa' ? this.fxaaMaterial : this.copyMaterial;
    material.uniforms.tDiffuse!.value = this.target.texture;
    this.quad.material = material;
    r.render(this.quadScene, this.quadCamera);
  }

  private resize(): void {
    this.renderer.setPixelRatio(this.scale);
    this.renderer.setSize(this.width, this.height, false);
    this.target?.setSize(this.pixelWidth, this.pixelHeight);
    (this.fxaaMaterial.uniforms.resolution!.value as THREE.Vector2).set(
      1 / this.pixelWidth,
      1 / this.pixelHeight,
    );
  }
}
