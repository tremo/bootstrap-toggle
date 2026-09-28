// Ege denizi: derinliğe göre turkuaz→lacivert, berrak sığlık, kıyı köpüğü, dalga normalleri.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

export const waterTime = { value: 0 };

export function buildSea(scene, waterNormals) {
  // deniz tabanı yükseklik haritası (yarım-float)
  const W = 512, H = 384, X0 = -2048, X1 = 2048, Z0 = -100, Z1 = 2972;
  const data = new Uint16Array(W * H);
  for (let j = 0; j < H; j++) {
    const z = Z0 + ((j + 0.5) / H) * (Z1 - Z0);
    for (let i = 0; i < W; i++) {
      const x = X0 + ((i + 0.5) / W) * (X1 - X0);
      data[j * W + i] = THREE.DataUtils.toHalfFloat(Math.max(-60, Math.min(60, heightAt(x, z))));
    }
  }
  const bed = new THREE.DataTexture(data, W, H, THREE.RedFormat, THREE.HalfFloatType);
  bed.minFilter = bed.magFilter = THREE.LinearFilter;
  bed.wrapS = bed.wrapT = THREE.ClampToEdgeWrapping;
  bed.needsUpdate = true;

  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.07, metalness: 0.0, transparent: true, envMapIntensity: 1.0 });
  const U = {
    tBed: { value: bed }, tWN: { value: waterNormals }, uTime: waterTime,
    bedRect: { value: new THREE.Vector4(X0, Z0, X1, Z1) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tBed; uniform sampler2D tWN; uniform float uTime; uniform vec4 bedRect;
varying vec3 vWPos;
float gFoam; float gDepth;
vec3 wn(vec2 p, float s, vec2 v) { return texture2D(tWN, p / s + v * uTime).rgb * 2.0 - 1.0; }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`)
      .replace('#include <map_fragment>', `
{
  vec2 bu = (vWPos.xz - bedRect.xy) / (bedRect.zw - bedRect.xy);
  float inside = step(0.0, bu.x) * step(bu.x, 1.0) * step(0.0, bu.y) * step(bu.y, 1.0);
  float bedH = mix(-60.0, texture2D(tBed, bu).r, inside);
  float d = vWPos.y - bedH;
  gDepth = d;
  if (d < 0.0) discard;
  vec3 shallow = vec3(0.10, 0.62, 0.62);
  vec3 mid = vec3(0.02, 0.33, 0.50);
  vec3 deep = vec3(0.004, 0.06, 0.16);
  vec3 c = mix(shallow, mid, smoothstep(0.5, 6.0, d));
  c = mix(c, deep, smoothstep(6.0, 40.0, d));
  float n1 = texture2D(tWN, vWPos.xz / 9.0 + vec2(uTime * 0.02, uTime * 0.013)).r;
  float n2 = texture2D(tWN, vWPos.xz / 3.1 - vec2(uTime * 0.03, -uTime * 0.021)).g;
  float line = sin(d * 7.0 - uTime * 1.6 + n1 * 3.0);
  gFoam = smoothstep(0.45, 0.0, d) * smoothstep(0.1, 0.8, n1 * 0.6 + n2 * 0.6 + line * 0.25);
  gFoam = max(gFoam, smoothstep(0.08, 0.0, d) * 0.8);
  c = mix(c, vec3(0.92, 0.95, 0.96), gFoam);
  diffuseColor.rgb = c;
  diffuseColor.a = mix(0.18, 0.97, smoothstep(0.0, 7.0, d));
  diffuseColor.a = max(diffuseColor.a, gFoam * 0.9);
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.06, 0.6, gFoam);')
      .replace('#include <normal_fragment_maps>', `
{
  float far = clamp(length(vWPos.xz - cameraPosition.xz) / 800.0, 0.0, 1.0);
  vec3 a = wn(vWPos.xz, 11.0, vec2(0.012, 0.008));
  vec3 b = wn(vWPos.xz, 4.2, vec2(-0.016, 0.011));
  vec3 c2 = wn(vWPos.xz, 47.0, vec2(0.004, -0.006));
  vec3 t = normalize(vec3((a.xy + b.xy * 0.7 + c2.xy * 1.2) * mix(0.55, 0.18, far), 1.0));
  vec3 nW = normalize(vec3(t.x, t.z, -t.y));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`);
  };
  mat.customProgramCacheKey = () => 'sea-v1';
  const geo = new THREE.PlaneGeometry(40000, 40000, 1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.name = 'sea';
  scene.add(mesh);
  return {
    mesh,
    update(t, camPos) {
      waterTime.value = t;
      mesh.position.set(Math.round(camPos.x / 100) * 100, Math.sin(t * 0.85) * 0.05 + Math.sin(t * 0.37) * 0.03, Math.round(camPos.z / 100) * 100);
    },
  };
}

export function buildPoolWater(W, waterNormals) {
  const wn = waterNormals.clone();
  wn.wrapS = wn.wrapT = THREE.RepeatWrapping;
  wn.repeat.set(0.35, 0.35);
  wn.needsUpdate = true;
  const mats = [];
  for (const p of W.poolsInfo) {
    const m = new THREE.MeshStandardMaterial({ color: 0x5fd4e8, transparent: true, opacity: 0.42, roughness: 0.03, metalness: 0, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35), emissive: 0x39c8ff, emissiveIntensity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(p.waterGeo, m);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    W.group.add(mesh);
    mats.push(m);
  }
  W.poolWaterMats = mats;
  return {
    update(t) { wn.offset.set(t * 0.02, t * 0.013); },
  };
}
