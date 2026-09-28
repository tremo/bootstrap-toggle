// Arazi ağı + katman karıştırma (splat) gölgelendiricisi
import * as THREE from 'three';
import { GRID, buildHeightGrid } from './terrain.js';

export const SPLAT = { x0: -170, z0: -175, x1: 170, z1: 105, ppm: 4 };

function makeArray(canvases, srgb, aniso) {
  const S = canvases[0].width, L = canvases.length;
  const data = new Uint8Array(S * S * 4 * L);
  canvases.forEach((c, i) => data.set(c.getContext('2d').getImageData(0, 0, S, S).data, i * S * S * 4));
  const t = new THREE.DataArrayTexture(data, S, S, L);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function buildTerrainMesh(T, splatCanvas, depress, renderer, shared) {
  const { XS, HGRID } = buildHeightGrid();
  const { N, cx, cz } = GRID;
  const W = N + 1;
  const pos = new Float32Array(W * W * 3);
  for (let j = 0; j < W; j++) {
    const z = XS[j] + cz;
    for (let i = 0; i < W; i++) {
      const x = XS[i] + cx;
      const k = (j * W + i) * 3;
      pos[k] = x; pos[k + 1] = HGRID[j * W + i] + depress(x, z); pos[k + 2] = z;
    }
  }
  const idx = new Uint32Array(N * N * 6);
  let p = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * W + i, b = (j + 1) * W + i, c = (j + 1) * W + i + 1, d = j * W + i + 1;
    idx[p++] = a; idx[p++] = b; idx[p++] = d;
    idx[p++] = b; idx[p++] = c; idx[p++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const layers = ['grass', 'dry', 'rock', 'sand', 'flag', 'pavers', 'asphalt'];
  const alb = makeArray(layers.map((l) => T[l].canvas), true, aniso);
  const nrm = makeArray(layers.map((l) => T[l].ncanvas), false, aniso);
  const splat = new THREE.CanvasTexture(splatCanvas);
  splat.minFilter = THREE.LinearFilter; splat.generateMipmaps = false;
  splat.wrapS = splat.wrapT = THREE.ClampToEdgeWrapping;

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const U = {
    tAlb: { value: alb }, tNrm: { value: nrm }, tSplat: { value: splat }, tMacro: { value: T.macro },
    splatRect: { value: new THREE.Vector4(SPLAT.x0, SPLAT.z0, SPLAT.x1, SPLAT.z1) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray tAlb; uniform sampler2DArray tNrm; uniform sampler2D tSplat; uniform sampler2D tMacro;
uniform vec4 splatRect;
varying vec3 vWPos; varying vec3 vWN;
float gWet; vec3 gTN; float gRough;
vec3 alb(vec2 p, float s, float l) { return texture(tAlb, vec3(p / s, l)).rgb; }
vec3 tnm(vec2 p, float s, float l) { vec3 n = texture(tNrm, vec3(p / s, l)).rgb * 2.0 - 1.0; n.y = -n.y; return n; }
`)
      .replace('#include <map_fragment>', `
{
  vec2 wp = vec2(vWPos.x, -vWPos.z);
  vec2 sp = (vWPos.xz - splatRect.xy) / (splatRect.zw - splatRect.xy);
  float inR = step(0.0, sp.x) * step(sp.x, 1.0) * step(0.0, sp.y) * step(sp.y, 1.0);
  vec3 A = texture2D(tSplat, vec2(sp.x * 0.5, 1.0 - sp.y)).rgb * inR;
  vec3 B = texture2D(tSplat, vec2(0.5 + sp.x * 0.5, 1.0 - sp.y)).rgb * inR;
  vec3 mac = texture2D(tMacro, vWPos.xz * 0.0035).rgb;
  vec3 mac2 = texture2D(tMacro, vWPos.xz * 0.045).rgb;
  float h = vWPos.y;
  float slope = 1.0 - vWN.y;
  float road = (1.0 - inR) * step(33.0, vWPos.z) * step(vWPos.z, 40.0) * step(abs(vWPos.x), 700.0);
  float asph = max(A.b, road);
  float beach = max(B.g, (1.0 - inR) * (1.0 - smoothstep(1.7, 2.6, h)) * (1.0 - road));
  beach = max(beach, 1.0 - step(0.0, h));
  float lawn = B.r;
  float dirt = B.b;
  float rockW = smoothstep(0.3, 0.55, slope + (mac.g - 0.5) * 0.3) * (1.0 - lawn) * (1.0 - asph) * 0.85;
  vec3 dryC = mix(alb(wp, 7.0, 1.0), alb(wp * 0.41 + 3.3, 7.0, 1.0), mac2.r);
  dryC *= 0.82 + mac.r * 0.36;
  // maki örtüsü: yamaçlarda koyu yeşil-kahve lekeler
  float maquis = smoothstep(0.42, 0.62, mac.g + mac2.b * 0.25) * (1.0 - B.r) * smoothstep(3.0, 12.0, h);
  dryC = mix(dryC, dryC * vec3(0.52, 0.62, 0.42), maquis * 0.85);
  dryC *= mix(1.0, 0.78, smoothstep(20.0, 120.0, h));
  vec3 grassC = mix(alb(wp, 3.5, 0.0), alb(wp * 0.37 + 1.7, 3.5, 0.0), mac2.b);
  grassC *= 0.85 + mac.b * 0.3;
  vec3 col = dryC;
  col = mix(col, grassC, lawn);
  col = mix(col, alb(wp, 9.0, 2.0) * vec3(0.78, 0.76, 0.72) * (0.85 + mac2.g * 0.2), rockW);
  vec3 sandC = alb(wp, 2.2, 3.0);
  col = mix(col, sandC, beach);
  col = mix(col, dryC * vec3(0.92, 0.86, 0.78), dirt);
  col = mix(col, alb(wp, 2.6, 4.0), A.r);
  col = mix(col, alb(wp, 1.6, 5.0), A.g);
  col = mix(col, alb(wp, 5.0, 6.0) * (0.9 + mac2.r * 0.2), asph);
  // yol çizgisi (sahil yolu orta şerit, kesikli)
  float mark = step(abs(vWPos.z - 36.5), 0.07) * step(0.5, fract(vWPos.x / 6.0)) * step(abs(vWPos.x), 700.0);
  col = mix(col, vec3(0.85, 0.83, 0.75), mark * 0.85);
  // ıslak kum ve deniz tabanı
  gWet = (1.0 - smoothstep(-0.05, 0.55, h)) * beach;
  col *= mix(1.0, 0.6, gWet);
  if (h < -0.2) {
    float grassSea = smoothstep(0.52, 0.42, mac.r) * smoothstep(-1.5, -3.0, h);
    col = mix(sandC * vec3(0.85, 0.9, 0.85), vec3(0.08, 0.14, 0.07), grassSea);
  }
  gRough = mix(0.96, 0.35, gWet);
  gRough = mix(gRough, 0.8, A.g);
  // normal karışımı
  vec3 tn = vec3(0.0, 0.0, 1.0);
  float wS = beach * (1.0 - A.r) * (1.0 - A.g) * (1.0 - asph);
  if (wS > 0.02) tn = mix(tn, tnm(wp, 2.2, 3.0), wS);
  if (rockW > 0.02) tn = mix(tn, tnm(wp, 9.0, 2.0), rockW);
  if (A.r > 0.02) tn = mix(tn, tnm(wp, 2.6, 4.0), A.r);
  if (A.g > 0.02) tn = mix(tn, tnm(wp, 1.6, 5.0), A.g);
  float wG = (1.0 - max(max(A.r, A.g), max(asph, beach))) ;
  tn = mix(tn, tnm(wp, 3.5, 0.0) * vec3(0.6, 0.6, 1.0), wG * lawn * 0.7);
  tn = mix(tn, tnm(wp, 7.0, 1.0), wG * (1.0 - lawn) * (1.0 - rockW) * 0.7);
  gTN = normalize(tn);
  diffuseColor.rgb *= col;
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', `
{
  vec3 Nw = normalize(vWN);
  vec3 Tw = normalize(vec3(1.0, 0.0, 0.0) - Nw * Nw.x);
  vec3 Bw = normalize(cross(Nw, Tw));
  vec3 nW = normalize(Tw * gTN.x + Bw * gTN.y + Nw * gTN.z);
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`);
  };
  mat.customProgramCacheKey = () => 'terrain-splat-v1';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.name = 'terrain';
  void shared;
  return mesh;
}
