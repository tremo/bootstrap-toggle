// Gün ışığı sistemi: Palamutbükü (36.67°K, 27.50°D, UTC+3) için gerçek güneş konumu,
// Preetham gökyüzü, ay, yıldızlar, sis, ortam haritası ve gece aydınlatması.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { clamp, smoothstep, lerp, mulberry32 } from './util.js';

const LAT = 36.67, LON = 27.5, TZ = 3, DAY = 201; // 20 Temmuz
const D2R = Math.PI / 180;

export function solarPosition(hours, dayOfYear = DAY) {
  const B = (360 / 365) * (dayOfYear - 81) * D2R;
  const decl = 23.44 * Math.sin(B) * D2R;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const tc = 4 * (LON - 15 * TZ) + eot;
  const lst = hours + tc / 60;
  const hra = 15 * (lst - 12) * D2R;
  const lat = LAT * D2R;
  const sinEl = Math.sin(decl) * Math.sin(lat) + Math.cos(decl) * Math.cos(lat) * Math.cos(hra);
  const el = Math.asin(clamp(sinEl, -1, 1));
  let az = Math.acos(clamp((Math.sin(decl) * Math.cos(lat) - Math.cos(decl) * Math.sin(lat) * Math.cos(hra)) / Math.max(1e-6, Math.cos(el)), -1, 1));
  if (hra > 0) az = 2 * Math.PI - az;
  return { el, az };
}
export function dirFromAzEl(az, el, v = new THREE.Vector3()) {
  // kuzey = -z, doğu = +x
  return v.set(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
}

function patchSky(sky) {
  const m = sky.material;
  m.uniforms.skyMul = { value: 1 };
  m.uniforms.skyAdd = { value: new THREE.Color(0, 0, 0) };
  m.fragmentShader = m.fragmentShader
    .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform float skyMul;\nuniform vec3 skyAdd;')
    .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyMul + skyAdd, 1.0 );');
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.hours = 13.0;
    this.sky = new Sky();
    patchSky(this.sky);
    this.sky.scale.setScalar(17000);
    this.sky.material.depthWrite = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    // ortam haritası için küçük gökyüzü sahnesi
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    patchSky(this.envSky);
    this.envSky.scale.setScalar(50);
    this.envScene.add(this.envSky);
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(60, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x404030 }));
    this.envGround.position.y = -1.5;
    this.envScene.add(this.envGround);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd7ff, 0x5a5040, 0.5);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xbcd0e0, 0.000105);

    // yıldızlar
    {
      const r = mulberry32(77), n = 3500;
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const y = Math.abs(u) * 0.98 + 0.02;
        pos.set([Math.cos(a) * s * 15000, y * 15000, Math.sin(a) * s * 15000], i * 3);
        const b = Math.pow(r(), 3) * 0.9 + 0.1, t = r();
        col.set([b * (0.85 + t * 0.15), b * 0.9, b * (1.1 - t * 0.2)], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false });
      this.stars = new THREE.Points(g, this.starMat);
      this.stars.renderOrder = -9;
      this.stars.frustumCulled = false;
      scene.add(this.stars);
    }
    this.moonMat = null;
    this.moon = null;
    this.nightK = 0;
    this.dayK = 1;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.moonDir = new THREE.Vector3(0, 1, 0);
    this.lastEnvHours = -99;
    this.exposure = 0.5;
    this.onChange = [];
    this.fogColor = new THREE.Color();
  }

  setMoonTexture(t) {
    this.moonMat = new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false, transparent: true, color: 0xffffff });
    this.moon = new THREE.Sprite(this.moonMat);
    this.moon.scale.setScalar(200);
    this.moon.renderOrder = -8;
    this.scene.add(this.moon);
  }

  label() {
    const h = ((this.hours % 24) + 24) % 24;
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const t = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const { el } = solarPosition(h);
    const d = el / D2R;
    let n = 'Gündüz';
    if (d < -6) n = 'Gece';
    else if (d < 1) n = h < 12 ? 'Şafak' : 'Alacakaranlık';
    else if (d < 12) n = h < 12 ? 'Sabah' : 'Gün batımı';
    return { time: t, name: n };
  }

  setTime(hours, force = false) {
    this.hours = ((hours % 24) + 24) % 24;
    const { el, az } = solarPosition(this.hours);
    dirFromAzEl(az, el, this.sunDir);
    // dolunaya yakın ay: güneşin karşısında
    const m = solarPosition((this.hours + 12.4) % 24, DAY + 180);
    dirFromAzEl(m.az, Math.max(m.el, -0.2) * 0.85 + 0.12, this.moonDir);
    const sinEl = Math.sin(el);
    this.dayK = smoothstep(-0.08, 0.12, sinEl);
    this.nightK = 1 - smoothstep(-0.2, -0.02, sinEl);
    const golden = smoothstep(0.35, 0.02, sinEl) * this.dayK;

    const u = this.sky.material.uniforms;
    for (const U of [u, this.envSky.material.uniforms]) {
      U.turbidity.value = lerp(2.4, 4.5, golden);
      U.rayleigh.value = lerp(1.0, 2.6, golden) * (0.35 + 0.65 * this.dayK) + this.nightK * 0.3;
      U.mieCoefficient.value = lerp(0.004, 0.009, golden);
      U.mieDirectionalG.value = 0.86;
      U.sunPosition.value.copy(this.sunDir);
      U.skyMul.value = lerp(0.1, 1.0, this.dayK);
      U.skyAdd.value.setRGB(0.0025, 0.0045, 0.011).multiplyScalar(this.nightK);
    }
    // ışık: gündüz güneş, gece ay (tek gölgeli ışık)
    const warm = new THREE.Color().setRGB(1.0, lerp(0.95, 0.58, golden), lerp(0.88, 0.34, golden));
    if (this.dayK > 0.02) {
      this.sun.color.copy(warm);
      this.sun.intensity = 3.4 * this.dayK * lerp(1, 0.65, golden);
      this.lightDir = this.sunDir;
    } else {
      this.sun.color.setRGB(0.62, 0.72, 1.0);
      this.sun.intensity = 0.28 * this.nightK;
      this.lightDir = this.moonDir;
    }
    this.hemi.intensity = lerp(0.045, 0.62, this.dayK);
    this.hemi.color.setRGB(lerp(0.25, 0.72, this.dayK), lerp(0.32, 0.82, this.dayK), lerp(0.55, 1.0, this.dayK));
    this.hemi.groundColor.setRGB(lerp(0.05, 0.36, this.dayK) * (1 - golden * 0.2), lerp(0.05, 0.32, this.dayK), lerp(0.06, 0.24, this.dayK));
    // sis = ufuk rengi
    const dayFog = new THREE.Color(0.66, 0.76, 0.86);
    const goldFog = new THREE.Color(0.86, 0.64, 0.46);
    const nightFog = new THREE.Color(0.012, 0.018, 0.035);
    this.fogColor.copy(dayFog).lerp(goldFog, golden).lerp(nightFog, 1 - this.dayK);
    this.scene.fog.color.copy(this.fogColor);
    this.scene.fog.density = lerp(0.00016, 0.000105, this.dayK);
    this.starMat.opacity = this.nightK;
    if (this.moon) {
      this.moon.position.copy(this.moonDir).multiplyScalar(14000);
      this.moonMat.opacity = smoothstep(-0.1, 0.1, this.moonDir.y) * lerp(0.35, 1, this.nightK);
    }
    this.exposure = lerp(1.35, 0.52, this.dayK) * lerp(1, 1.12, golden);
    this.envGround.material.color.setRGB(0.3, 0.28, 0.2).multiplyScalar(lerp(0.02, 1, this.dayK));
    if (force || Math.abs(this.hours - this.lastEnvHours) > 0.08) this.updateEnv();
    for (const f of this.onChange) f(this);
  }

  updateEnv() {
    this.lastEnvHours = this.hours;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
    this.scene.environment = this.envRT.texture;
  }

  // gölge kamerasını oyuncuya göre (texel adımlı) konumla
  follow(pos) {
    const d = this.lightDir || this.sunDir;
    const texel = 150 / 4096;
    const cx = Math.round(pos.x / texel) * texel, cz = Math.round(pos.z / texel) * texel;
    this.sun.target.position.set(cx, pos.y, cz);
    this.sun.position.set(cx + d.x * 250, pos.y + Math.max(0.08, d.y) * 250, cz + d.z * 250);
    this.sun.target.updateMatrixWorld();
  }
}

// Gece aydınlatması: en yakın lambalara gerçek ışık, diğerleri ışıma
export class NightLights {
  constructor(scene, world, T) {
    this.world = world;
    this.pool = [];
    for (let i = 0; i < 10; i++) {
      const l = new THREE.PointLight(0xffc27a, 0, 16, 2);
      l.castShadow = false;
      scene.add(l);
      this.pool.push(l);
    }
    // uzak ışımalar (sprite)
    const n = world.lamps.length + (world.villageLights?.length || 0);
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), sz = new Float32Array(n);
    let k = 0;
    for (const l of world.lamps) { pos.set([l.x, l.y, l.z], k * 3); sz[k++] = l.type === 'street' ? 7 : l.type === 'pole' ? 3.2 : 1.6; }
    for (const v of world.villageLights || []) { pos.set(v, k * 3); sz[k++] = 2.2; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
    this.glowMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: T.glow }, k: { value: 0 }, color: { value: new THREE.Color(1.0, 0.72, 0.42) } },
      vertexShader: `attribute float size; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = size * 380.0 / -mv.z; vA = clamp(-mv.z/400.0,0.0,1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform float k; uniform vec3 color; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color * t.rgb * k * (1.2 + vA*2.0), t.a * k); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.glows = new THREE.Points(g, this.glowMat);
    this.glows.frustumCulled = false;
    scene.add(this.glows);
    // uzak köy ışıkları ve adalardaki yerleşimler
    const r = mulberry32(5);
    const far = [];
    for (const I of world.islands || []) {
      for (let i = 0; i < 40; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.7;
        const p = I.mesh.position;
        far.push(p.x + Math.cos(a) * d * I.mesh.scale.x, 3 + r() * I.mesh.scale.y * 0.25, p.z + Math.sin(a) * d * I.mesh.scale.z);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(far), 3));
    this.farMat = new THREE.PointsMaterial({ color: 0xffc98a, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.far = new THREE.Points(fg, this.farMat);
    scene.add(this.far);
  }
  update(camPos, nightK, t) {
    const W = this.world;
    const on = smoothstep(0.25, 0.75, nightK);
    this.glowMat.uniforms.k.value = on;
    this.farMat.opacity = on * 0.9;
    const M = W.M;
    M.glassLit.emissiveIntensity = on * 1.6;
    M.lampHead.emissiveIntensity = on * 6;
    M.poolTile.emissiveIntensity = on * 0.55;
    M.lampRed.emissiveIntensity = on * (Math.sin(t * 3) > 0.2 ? 3 : 0.2);
    for (const m of W.neonMats || []) m.emissiveIntensity = 0.4 + on * (2.2 + Math.sin(t * 7) * 0.2);
    if (W.poolWaterMats) for (const m of W.poolWaterMats) m.emissiveIntensity = on * 0.35;
    if (on <= 0.01) { for (const l of this.pool) l.intensity = 0; return; }
    // en yakın lambalar
    const lamps = W.lamps;
    const best = [];
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i];
      const d = (l.x - camPos.x) ** 2 + (l.z - camPos.z) ** 2;
      if (d > 70 * 70) continue;
      best.push([d, i]);
    }
    best.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < this.pool.length; i++) {
      const P = this.pool[i];
      const e = best[i];
      if (!e) { P.intensity = 0; continue; }
      const l = lamps[e[1]];
      P.position.set(l.x, l.y - (l.type === 'street' ? 0.3 : 0.05), l.z);
      const fade = 1 - smoothstep(50 * 50, 70 * 70, e[0]);
      const I = { bollard: 2.2, pole: 9, street: 30, wall: 6, pool: 10, string: 9 }[l.type] || 5;
      P.intensity = I * on * fade;
      P.distance = l.type === 'street' ? 26 : l.type === 'bollard' ? 7 : 15;
      P.color.setRGB(1, l.type === 'street' ? 0.84 : 0.74, l.type === 'street' ? 0.64 : 0.45);
    }
  }
}
