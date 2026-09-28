// Son işlem: MSAA HDR hedef → dünya + silah geçişi → bloom → derecelendirme/gece görüş → ton eşleme
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uNVG: { value: 0 }, uDamage: { value: 0 }, uFlash: { value: 0 },
    uUnder: { value: 0 }, uLow: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uGain: { value: 18 }, uBlur: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
uniform sampler2D tDiffuse; uniform float uTime, uNVG, uDamage, uFlash, uUnder, uLow, uGain, uBlur; uniform vec2 uRes;
varying vec2 vUv;
float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  if (uUnder > 0.0) uv += vec2(sin(uv.y * 38.0 + uTime * 2.7), cos(uv.x * 29.0 + uTime * 2.1)) * 0.0035 * uUnder;
  float ca = uDamage * 0.004 + uBlur * 0.002;
  vec3 c;
  c.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
  c.g = texture2D(tDiffuse, uv).g;
  c.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
  if (uBlur > 0.0) {
    vec3 s = vec3(0.0);
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.785; s += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * uBlur * 0.006).rgb; }
    c = mix(c, s / 8.0, clamp(uBlur, 0.0, 1.0));
  }
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, 1.07), 0.0);
  c = mix(c, c * vec3(0.18, 0.62, 0.72) + vec3(0.0, 0.025, 0.04) * (0.2 + l), uUnder);
  vec2 dd = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float v = dot(dd, dd);
  if (uNVG > 0.0) {
    float L = dot(c, vec3(0.3, 0.59, 0.11)) * uGain;
    L = L / (1.0 + L * 0.9);
    float n = rand(floor(uv * uRes * 0.5) + fract(uTime * 13.0) * 100.0);
    L = L * 0.88 + (n - 0.5) * 0.16 + 0.018;
    vec3 g = vec3(0.32, 1.0, 0.42) * L * 1.5;
    float r = length(dd);
    g *= smoothstep(0.66, 0.56, r);
    g *= 1.0 - r * 0.6;
    c = mix(c, g, uNVG);
  }
  c = mix(c, c * 0.45 + vec3(0.25, 0.0, 0.0) * (l + 0.05), clamp(uDamage * (v * 3.5 + 0.08), 0.0, 0.85));
  c *= 1.0 - v * 0.38;
  c = mix(c, vec3(dot(c, vec3(0.3, 0.59, 0.11))), uLow * 0.65);
  c = mix(c, vec3(6.0), clamp(uFlash, 0.0, 1.0));
  c += (rand(uv * uRes * 0.37 + uTime) - 0.5) * 0.012 * (1.0 + uNVG * 2.0) * (0.3 + l);
  gl_FragColor = vec4(c, 1.0);
}`,
};

export class Post {
  constructor(renderer, scene, camera, vScene, vCamera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.worldPass = new RenderPass(scene, camera);
    this.viewPass = new RenderPass(vScene, vCamera);
    this.viewPass.clear = false;
    this.viewPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.25, 0.45, 0.92);
    this.grade = new ShaderPass(GradeShader);
    this.out = new OutputPass();
    this.composer.addPass(this.worldPass);
    this.composer.addPass(this.viewPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(this.out);
    this.U = this.grade.uniforms;
    this.U.uRes.value.copy(size);
  }
  setSize(w, h) {
    this.composer.setSize(w, h);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.U.uRes.value.copy(s);
  }
  render(dt) { this.composer.render(dt); }
}
