// Önyükleme, menüler ve ana döngü
import * as THREE from 'three';
import { buildTextures } from './textures.js';
import { World } from './world.js';
import { Environment, NightLights } from './sky.js';
import { buildSea, buildPoolWater } from './water.js';
import { Post } from './post.js';
import { windUniform } from './vegetation.js';
import { groundAt } from './terrain.js';
import { loadSoldierTemplate, SoldierView } from './soldier.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { Game } from './game.js';
import { drawPlan } from './hud.js';

const $ = (id) => document.getElementById(id);
const loadBar = $('loadBar'), loadLabel = $('loadLabel');
function progress(k, label) {
  loadBar.style.width = `${Math.round(k * 100)}%`;
  if (label) loadLabel.textContent = label;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('mertur.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('mertur.' + k, JSON.stringify(v)); } catch (e) { /* yok */ } },
};

const G = {};
window.__G = G;
const DEBUG = location.hash === '#debug';
const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;

const QUALITY = [
  { name: 'Düşük', pr: 0.75, shadow: 2048, bloom: false },
  { name: 'Orta', pr: 1.0, shadow: 2048, bloom: true },
  { name: 'Yüksek', pr: 1.5, shadow: 4096, bloom: true },
];

async function boot() {
  const canvas = $('gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', logarithmicDepthBuffer: true, stencil: false });
  } catch (e) {
    throw new Error('WebGL2 başlatılamadı. Donanım hızlandırmanın açık olduğu güncel bir tarayıcı gerekiyor.');
  }
  G.renderer = renderer;
  G.quality = store.get('quality', touch ? 0 : 1);
  applyPixelRatio();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 24000);
  camera.position.set(-8, 4, 8);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const vScene = new THREE.Scene();
  const vCamera = new THREE.PerspectiveCamera(55, camera.aspect, 0.01, 10);
  Object.assign(G, { scene, camera, vScene, vCamera });

  progress(0.02, 'Dokular üretiliyor: sıva, alaturka kiremit, kayrak taşı, çakıl…');
  const T = await buildTextures(renderer, (k, n) => progress(0.02 + k * 0.28, `Doku: ${n}`));
  G.T = T;
  const env = new Environment(scene, renderer);
  env.setMoonTexture(T.moon);
  G.env = env;

  progress(0.32, 'Arazi ve vaziyet planı kuruluyor…');
  const world = new World(scene, T, renderer, (k, n) => progress(0.32 + k * 0.4, `Yerleşim: ${n}`));
  await world.build();
  G.world = world;

  progress(0.76, 'Deniz ve havuzlar…');
  const wn = await new THREE.TextureLoader().loadAsync('assets/waternormals.jpg');
  G.sea = buildSea(scene, wn);
  G.poolWater = buildPoolWater(world, wn);
  G.night = new NightLights(scene, world, T);

  progress(0.82, 'ΕΚΑΜ operatörleri yükleniyor…');
  G.S = await loadSoldierTemplate(T);
  G.post = new Post(renderer, scene, camera, vScene, vCamera);
  env.setTime(store.get('hours', 13), true);
  applyQuality();

  G.audio = new GameAudio();
  G.audio.vol = store.get('vol', 0.8);
  G.input = new Input(canvas);
  G.input.sens = store.get('sens', 1);
  progress(0.9, 'Yol ağı ve siper noktaları hesaplanıyor…');
  await new Promise((r) => setTimeout(r, 20));
  G.game = new Game({ renderer, scene, camera, vScene, vCamera, world, env, night: G.night, post: G.post, T, S: G.S, audio: G.audio, input: G.input, sea: G.sea, poolWater: G.poolWater });
  G.game.baseHFov = store.get('fov', 95);
  G.game.onOver = showOver;
  G.game.onMap = (open) => { $('mapview').hidden = !open; if (open) drawPlan($('bigMap'), { player: { x: G.game.player.pos.x, z: G.game.player.pos.z, yaw: G.game.player.yaw } }); };

  progress(0.95, 'Gölgelendiriciler derleniyor…');
  await warmup();

  window.addEventListener('resize', onResize);
  onResize();
  setupMenu();
  progress(1, 'Hazır');
  $('loading').hidden = true;
  G.ready = true;
  if (DEBUG) { G.input.enabled = true; startGame(true); }
  else showMenu();
  requestAnimationFrame(frame);
}

function applyPixelRatio() {
  const q = QUALITY[G.quality];
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
}
function applyQuality() {
  const q = QUALITY[G.quality];
  applyPixelRatio();
  const sun = G.env.sun;
  if (sun.shadow.mapSize.x !== q.shadow) {
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  G.post.bloom.enabled = q.bloom;
  onResize();
}

// gölgelendiricileri önceden derle (gündüz + gece ışık kombinasyonları)
async function warmup() {
  const g = G.game, cam = G.camera;
  cam.position.set(-8, 4, 12);
  cam.lookAt(-8, 2, 0);
  const sv = new SoldierView(G.S, G.scene, 'ar');
  const p = new THREE.Vector3(-8, groundAt(-8, 2), 2);
  sv.update(0.016, p, 0, 0, cam.position, true, 0);
  const h0 = G.env.hours;
  for (const h of [h0, 23.5, 13]) {
    G.env.setTime(h, true);
    G.night.update(cam.position, G.env.nightK, 0);
    g.fx.update(0.016, cam.position);
    try { G.renderer.compile(G.scene, cam); } catch (e) { /* bazı sürücüler */ }
    G.post.render(0.016);
    await new Promise((r) => setTimeout(r, 0));
  }
  sv.dispose(G.scene);
  G.env.setTime(h0, true);
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  G.renderer.setSize(w, h, false);
  G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
  G.vCamera.aspect = w / h; G.vCamera.updateProjectionMatrix();
  G.post.setSize(w, h);
  if (!$('menu').hidden) drawPlan($('menuMap'));
  if (G.game) G.game.hud.scopeDrawn = '';
}

// ---------------- menü ----------------
const opts = { mode: 'waves', hours: 13, diff: 'normal', timeFlow: false };
function fmtTime(h) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function setupMenu() {
  opts.hours = store.get('hours', 13);
  opts.diff = store.get('diff', 'normal');
  opts.mode = store.get('mode', 'waves');
  opts.timeFlow = store.get('flow', false);
  const seg = (id, key, onPick) => {
    const el = $(id);
    const sync = () => el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(String(opts[key]) === b.dataset.v)));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      opts[key] = key === 'hours' ? parseFloat(b.dataset.v) : b.dataset.v;
      sync(); if (onPick) onPick();
    });
    sync();
    return sync;
  };
  const tr = $('timeRange');
  const setTimeUI = () => {
    tr.value = opts.hours;
    G.env.setTime(opts.hours, true);
    $('timeVal').textContent = `${fmtTime(opts.hours)} · ${G.env.label().name}`;
    store.set('hours', opts.hours);
  };
  const syncTime = seg('segTime', 'hours', setTimeUI);
  seg('segMode', 'mode', () => store.set('mode', opts.mode));
  seg('segDiff', 'diff', () => store.set('diff', opts.diff));
  tr.addEventListener('input', () => { opts.hours = parseFloat(tr.value); setTimeUI(); syncTime(); });
  setTimeUI();
  $('timeFlow').checked = opts.timeFlow;
  $('timeFlow').addEventListener('change', (e) => { opts.timeFlow = e.target.checked; store.set('flow', opts.timeFlow); });
  $('btnStart').addEventListener('click', () => startGame());
  if (touch) $('touchNote').hidden = false;

  // duraklatma ayarları
  const pt = $('pTime'), ps = $('pSens'), pf = $('pFov'), pv = $('pVol'), pq = $('pQual');
  const refresh = () => {
    pt.value = G.env.hours; $('pTimeO').textContent = fmtTime(G.env.hours);
    ps.value = G.input.sens; $('pSensO').textContent = (+G.input.sens).toFixed(2);
    pf.value = G.game.baseHFov; $('pFovO').textContent = `${G.game.baseHFov}°`;
    pv.value = G.audio.vol; $('pVolO').textContent = `${Math.round(G.audio.vol * 100)}%`;
    pq.value = G.quality; $('pQualO').textContent = QUALITY[G.quality].name;
    $('pFlow').checked = G.game.timeFlow;
  };
  G.refreshPause = refresh;
  pt.addEventListener('input', () => { G.env.setTime(parseFloat(pt.value), true); refresh(); });
  ps.addEventListener('input', () => { G.input.sens = parseFloat(ps.value); store.set('sens', G.input.sens); refresh(); });
  pf.addEventListener('input', () => { G.game.baseHFov = parseInt(pf.value, 10); store.set('fov', G.game.baseHFov); refresh(); });
  pv.addEventListener('input', () => { G.audio.setVolume(parseFloat(pv.value)); store.set('vol', G.audio.vol); refresh(); });
  pq.addEventListener('input', () => { G.quality = parseInt(pq.value, 10); store.set('quality', G.quality); applyQuality(); refresh(); });
  $('pFlow').addEventListener('change', (e) => { G.game.timeFlow = e.target.checked; });
  $('btnResume').addEventListener('click', resume);
  $('btnQuit').addEventListener('click', () => { $('pause').hidden = true; showMenu(); });
  $('btnAgain').addEventListener('click', () => { $('over').hidden = true; startGame(); });
  $('btnMenu').addEventListener('click', () => { $('over').hidden = true; showMenu(); });
  G.input.onLockChange = (locked, failed) => {
    const g = G.game;
    if (!g.running || g.over) return;
    if (locked) { $('pause').hidden = true; g.paused = false; }
    else if (!failed && !G.input.touch.active) pause();
  };
  if (touch) G.input.setupTouch($('touch'));
  $('touch').hidden = true;
}

function showMenu() {
  const g = G.game;
  g.running = false; g.paused = false;
  g.enemies.clear();
  g.hud.show(false);
  $('scope').hidden = true;
  $('touch').hidden = true;
  $('mapview').hidden = true;
  $('menu').hidden = false;
  G.input.enabled = false;
  G.input.unlock();
  G.env.setTime(opts.hours, true);
  requestAnimationFrame(() => drawPlan($('menuMap')));
}

function startGame(debug = false) {
  $('menu').hidden = true;
  $('over').hidden = true;
  $('pause').hidden = true;
  G.audio.init();
  G.audio.setVolume(G.audio.vol);
  G.input.enabled = true;
  if (G.input.touch.active) $('touch').hidden = false;
  G.game.start({ ...opts });
  if (!debug && !G.input.touch.active) G.input.lock();
}

function pause() {
  const g = G.game;
  if (!g.running || g.over) return;
  g.paused = true;
  if (g.mapOpen) g.toggleMap();
  if (G.refreshPause) G.refreshPause();
  $('pause').hidden = false;
}
function resume() {
  $('pause').hidden = true;
  G.game.paused = false;
  G.audio.init();
  if (!G.input.touch.active) G.input.lock();
}

function showOver(r) {
  G.input.unlock();
  $('overTitle').textContent = r.title;
  $('overText').textContent = r.text;
  $('overStats').innerHTML = r.stats.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
  setTimeout(() => { $('over').hidden = false; }, 400);
}

// ---------------- döngü ----------------
let last = performance.now();
let menuT = 0;
const _v2 = new THREE.Vector2();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const g = G.game;
  if (!g) return;
  const P = g.player;
  if (G.input.touch.active && G.input.hit('Escape') && g.running && !g.over) { if (g.paused) resume(); else pause(); }
  const active = g.running && !g.paused && !G.dbg.frozen;
  if (active) g.update(dt);
  else if (!g.running) {
    // menü arkası: yavaşça dönen havadan görünüm
    menuT += dt * 0.03;
    const r = 150;
    G.camera.fov = 55; G.camera.updateProjectionMatrix();
    G.camera.position.set(-10 + Math.sin(menuT) * r, 60, -10 + Math.cos(menuT) * r);
    G.camera.lookAt(0, 4, -10);
  }
  const wall = now / 1000;
  windUniform.value = wall;
  G.sea.update(wall, G.camera.position);
  G.poolWater.update(wall);
  G.world.update(dt, wall);
  G.env.follow(g.running ? P.pos : new THREE.Vector3(-5, 3, -15));
  G.night.update(G.camera.position, G.env.nightK, wall);
  g.fx.update(active ? dt : 0, G.camera.position);
  g.fx.setLight(Math.max(G.env.dayK, 0.12));
  g.weapons.root.visible = g.running;
  g.weapons.syncLights(G.env, G.camera, g.flashlightOn ? 0.5 : 0);
  G.vScene.environment = G.scene.environment;
  const pp = g.running ? g.postParams() : { nvg: 0, damage: 0, flash: 0, blur: 0, under: 0, low: 0 };
  const U = G.post.U;
  U.uTime.value = wall;
  U.uNVG.value = pp.nvg; U.uDamage.value = pp.damage; U.uFlash.value = pp.flash; U.uUnder.value = pp.under; U.uLow.value = pp.low; U.uBlur.value = pp.blur;
  U.uGain.value = G.env.nightK > 0.5 ? 26 : 5;
  G.renderer.toneMappingExposure = pp.nvg ? 0.9 : G.env.exposure;
  G.post.bloom.threshold = pp.nvg ? 0.9 : 1.7 / G.env.exposure;
  G.post.bloom.strength = pp.nvg ? 0.45 : 0.16 + G.env.nightK * 0.3;
  const s = G.renderer.getDrawingBufferSize(_v2).y / (2 * Math.tan((G.camera.fov * Math.PI) / 360));
  for (const ps of [g.fx.sparks, g.fx.smoke, g.fx.dust, g.fx.blood, g.fx.flashes]) ps.mat.uniforms.uScale.value = s;
  if (g.running || $('menu').hidden) G.post.render(dt);
  G.input.endFrame();
}

// hata ayıklama yardımcıları (yalnızca konsoldan)
G.dbg = {
  cam(x, y, z, yaw = 0, pitch = 0) { const c = G.camera; c.position.set(x, y ?? groundAt(x, z) + 1.7, z); c.rotation.set(pitch, yaw, 0, 'YXZ'); },
  time(h) { G.env.setTime(h, true); },
  tp(x, z, yaw = 0) { const P = G.game.player; P.pos.set(x, G.world.floorAt(x, z), z); P.yaw = yaw; P.pitch = 0; },
  god(v = true) { G.game.godMode = v; },
  frozen: false,
  // test: oyunu çizmeden ilerlet
  sim(sec, dt = 1 / 30, input = null) {
    const g = G.game;
    const n = Math.round(sec / dt);
    for (let i = 0; i < n; i++) {
      if (input) input(i * dt);
      g.update(dt);
      g.fx.update(dt, G.camera.position);
      G.input.endFrame();
    }
  },
};

boot().catch((e) => {
  console.error(e);
  $('loadErr').textContent = 'Yüklenemedi: ' + (e && e.message ? e.message : e);
});
