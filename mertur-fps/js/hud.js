// HUD ve vaziyet planı çizimi (menü + M haritası)
import { BUILDINGS, POOLS, PATHS, PARKING, ACCESS_ROAD, SITE_TREES, GAZEBO, TEA_GARDEN, PLAYGROUND, WALLS } from './layout.js';
import { SW_CORNER, APEX, SE_CORNER, ROAD_Z0, ROAD_Z1, shoreZ } from './terrain.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.g = game;
    this.el = {
      root: $('hud'), mode: $('hMode'), left: $('hLeft'), score: $('hScore'), clock: $('hClock'),
      nvg: $('cNvg'), light: $('cLight'), stance: $('cStance'), hp: $('hHp'), mHp: $('mHp'), mSt: $('mSt'), band: $('hBand'),
      wName: $('wName'), wCal: $('wCal'), wAmmo: $('wAmmo'), wMode: $('wMode'), cross: $('cross'), hit: $('hit'),
      feed: $('feed'), subs: $('subs'), msg: $('msg'), dmg: $('dmg'), nade: $('nade'), prompt: $('prompt'), fps: $('fps'),
      strip: $('compStrip'), scope: $('scope'), scopeCanvas: $('scopeCanvas'),
    };
    this.buildCompass();
    this.t = 0;
    this.hitT = null;
    this.msgT = null;
    this.frames = 0; this.fpsT = 0;
    this.scopeDrawn = '';
  }

  buildCompass() {
    const s = this.el.strip;
    s.innerHTML = '';
    const names = { 0: 'K', 45: 'KD', 90: 'D', 135: 'GD', 180: 'G', 225: 'GB', 270: 'B', 315: 'KB' };
    this.pxPerDeg = 2.4;
    for (let d = -360; d <= 720; d += 15) {
      const x = d * this.pxPerDeg;
      const n = ((d % 360) + 360) % 360;
      const tick = document.createElement('i');
      tick.style.left = `${x}px`;
      s.appendChild(tick);
      const lab = document.createElement('span');
      lab.style.left = `${x}px`;
      if (names[n] !== undefined) { lab.textContent = names[n]; lab.className = 'card'; }
      else lab.textContent = String(n);
      s.appendChild(lab);
    }
  }

  show(v) { this.el.root.hidden = !v; }

  update(dt) {
    const g = this.g, P = g.player, W = g.weapons, E = this.el;
    this.t += dt;
    // pusula (her kare)
    const heading = ((-P.yaw * 180) / Math.PI % 360 + 360) % 360;
    const w = E.strip.parentElement.clientWidth;
    E.strip.style.transform = `translateX(${w / 2 - heading * this.pxPerDeg}px)`;
    // nişangâh aralığı
    const d = W.w.def;
    const spread = d.spreadHip + d.spreadMove * Math.min(1, P.hSpeed / 4) + W.bloomV * 0.4;
    const gap = 6 + spread * 7 * (1 - W.ads);
    const show = W.ads < 0.3 && !P.dead && !(d.type === 'sniper' && W.ads > 0.5);
    E.cross.style.opacity = show ? (P.sprinting ? 0.25 : 1) : 0;
    const cs = E.cross.children;
    cs[0].style.top = `${-gap - 9}px`; cs[1].style.top = `${gap}px`; cs[2].style.left = `${-gap - 9}px`; cs[3].style.left = `${gap}px`;
    // dürbün
    const scoped = d.type === 'sniper' && W.ads > 0.92 && !P.dead;
    if (E.scope.hidden === scoped) { E.scope.hidden = !scoped; if (scoped) this.drawScope(); }
    // metinler (10 Hz)
    this.fpsT += dt; this.frames++;
    if (this.fpsT < 0.1) return;
    const hp = Math.max(0, Math.ceil(P.health));
    E.hp.textContent = hp;
    E.mHp.firstElementChild.style.width = `${hp}%`;
    E.mHp.classList.toggle('low', hp < 35);
    E.mSt.firstElementChild.style.width = `${P.stamina}%`;
    E.band.innerHTML = P.bandaging > 0 ? 'Sargı yapılıyor…' : `Sargı ×${P.bandages} · <kbd style="border-color:currentColor">H</kbd>`;
    const info = W.hudInfo();
    E.wName.textContent = info.name;
    E.wCal.textContent = info.cal;
    E.wAmmo.innerHTML = `${info.ammo}<small> / ${info.reserve}</small>`;
    E.wAmmo.classList.toggle('low', info.ammo <= Math.ceil(info.mag * 0.25));
    E.wMode.textContent = `${W.reloading > 0 ? 'ŞARJÖR DEĞİŞİYOR' : info.mode} · El bombası ×${W.grenades}`;
    const lab = g.env.label();
    E.clock.textContent = `${lab.time} · ${lab.name}`;
    E.nvg.classList.toggle('on', g.nvgOn);
    E.light.classList.toggle('on', g.flashlightOn);
    E.stance.textContent = P.crouch > 0.5 ? 'ÇÖMELİK' : P.sprinting ? 'KOŞU' : P.inWater > 0.2 ? 'SUDA' : 'AYAKTA';
    E.score.textContent = `Puan ${g.score} · Etkisiz ${P.kills}`;
    const m = g.modeInfo();
    E.mode.textContent = m.title; E.left.textContent = m.sub;
    if (this.fpsT > 0.5) { E.fps.textContent = `${Math.round(this.frames / this.fpsT)} fps`; this.frames = 0; this.fpsT = 0; }
    else if (this.fpsT >= 0.1) { /* biriktir */ }
    if (this.fpsT > 0.5) this.fpsT = 0;
  }

  hitmarker(kill) {
    const h = this.el.hit;
    h.classList.toggle('kill', !!kill);
    h.style.opacity = 1;
    clearTimeout(this.hitT);
    this.hitT = setTimeout(() => (h.style.opacity = 0), kill ? 260 : 120);
    this.g.audio.hit(kill);
  }
  feed(text, hs) {
    const d = document.createElement('div');
    d.textContent = text;
    if (hs) d.className = 'hs';
    this.el.feed.appendChild(d);
    while (this.el.feed.children.length > 5) this.el.feed.firstChild.remove();
    setTimeout(() => d.remove(), 4200);
  }
  subtitle(gr, tr, near) {
    const d = document.createElement('div');
    d.innerHTML = `<span class="gr">${near ? '' : '[telsiz] '}«${gr}»</span>${tr}`;
    this.el.subs.appendChild(d);
    while (this.el.subs.children.length > 3) this.el.subs.firstChild.remove();
    setTimeout(() => d.remove(), 4600);
  }
  message(m1, m2 = '', dur = 3.5) {
    this.el.msg.innerHTML = `<div class="m1">${m1}</div>${m2 ? `<div class="m2">${m2}</div>` : ''}`;
    clearTimeout(this.msgT);
    this.msgT = setTimeout(() => (this.el.msg.innerHTML = ''), dur * 1000);
  }
  prompt(t) { this.el.prompt.textContent = t || ''; }
  damage(from, dmg) {
    if (!from) return;
    const P = this.g.player;
    const a = Math.atan2(from.x - P.pos.x, from.z - P.pos.z);
    // oyuncuya göre açı: ileri = -z yönü (yaw)
    const rel = a - Math.atan2(-Math.sin(P.yaw), -Math.cos(P.yaw));
    const i = document.createElement('i');
    i.style.transform = `rotate(${rel * -180 / Math.PI + 0}deg)`;
    i.style.opacity = Math.min(1, 0.4 + dmg / 30);
    this.el.dmg.appendChild(i);
    requestAnimationFrame(() => requestAnimationFrame(() => { i.style.opacity = 0; }));
    setTimeout(() => i.remove(), 1400);
  }
  nadeWarn() {
    this.el.nade.hidden = false;
    clearTimeout(this.nadeT);
    this.nadeT = setTimeout(() => (this.el.nade.hidden = true), 2500);
  }

  drawScope() {
    const c = this.el.scopeCanvas;
    const w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight;
    const key = `${w}x${h}`;
    if (this.scopeDrawn === key) return;
    this.scopeDrawn = key;
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = w * dpr; c.height = h * dpr;
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const R = Math.min(w, h) * 0.46, cx = w / 2, cy = h / 2;
    x.fillStyle = '#000';
    x.beginPath(); x.rect(0, 0, w, h); x.arc(cx, cy, R, 0, Math.PI * 2, true); x.fill();
    const g = x.createRadialGradient(cx, cy, R * 0.75, cx, cy, R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.9)'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
    x.lineWidth = 4;
    x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx - R * 0.42, cy); x.moveTo(cx + R * 0.42, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy + R * 0.42); x.lineTo(cx, cy + R); x.stroke();
    // mil noktaları (1 mil ≈ R/10)
    x.fillStyle = 'rgba(0,0,0,0.9)';
    const mil = R * 0.068;
    for (let i = -5; i <= 5; i++) {
      if (!i) continue;
      x.beginPath(); x.ellipse(cx + i * mil, cy, 2.2, 2.2, 0, 0, 7); x.fill();
      x.beginPath(); x.ellipse(cx, cy + i * mil, 2.2, 2.2, 0, 0, 7); x.fill();
    }
    x.fillStyle = 'rgba(220,40,20,0.9)';
    x.beginPath(); x.arc(cx, cy, 1.6, 0, 7); x.fill();
  }
}

// ---------------- vaziyet planı çizimi ----------------
export function drawPlan(canvas, opts = {}) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const x = canvas.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, W, H);
  const ink = opts.ink || '#2c4a95';
  const X0 = -130, X1 = 125, Z0 = -135, Z1 = 78;
  const s = Math.min(W / (X1 - X0), H / (Z1 - Z0));
  const ox = (W - (X1 - X0) * s) / 2 - X0 * s, oz = (H - (Z1 - Z0) * s) / 2 - Z0 * s;
  const P = (wx, wz) => [ox + wx * s, oz + wz * s];
  x.lineJoin = 'round'; x.lineCap = 'round';
  x.strokeStyle = ink; x.fillStyle = ink;
  // kıyı çizgisi ve deniz
  x.save();
  x.globalAlpha = 0.18;
  x.beginPath();
  for (let wx = X0 - 10; wx <= X1 + 10; wx += 4) { const [a, b] = P(wx, shoreZ(wx)); wx === X0 - 10 ? x.moveTo(a, b) : x.lineTo(a, b); }
  x.lineTo(...P(X1 + 10, Z1 + 20)); x.lineTo(...P(X0 - 10, Z1 + 20)); x.closePath();
  x.fill();
  x.restore();
  x.lineWidth = 1.2;
  x.beginPath();
  for (let wx = X0 - 10; wx <= X1 + 10; wx += 4) { const [a, b] = P(wx, shoreZ(wx)); wx === X0 - 10 ? x.moveTo(a, b) : x.lineTo(a, b); }
  x.stroke();
  // dalga çizgileri
  x.globalAlpha = 0.35; x.lineWidth = 0.8;
  for (let k = 1; k < 4; k++) {
    x.beginPath();
    for (let wx = X0; wx <= X1; wx += 4) { const [a, b] = P(wx, shoreZ(wx) + k * 4 + Math.sin(wx * 0.2) * 0.6); wx === X0 ? x.moveTo(a, b) : x.lineTo(a, b); }
    x.stroke();
  }
  x.globalAlpha = 1;
  // sahil yolu
  x.lineWidth = 1;
  for (const z of [ROAD_Z0, ROAD_Z1]) { x.beginPath(); x.moveTo(...P(X0 - 10, z)); x.lineTo(...P(X1 + 10, z)); x.stroke(); }
  // bağlantı yolu
  x.lineWidth = 6.5 * s; x.globalAlpha = 0.12;
  x.beginPath(); ACCESS_ROAD.forEach(([a, b], i) => (i ? x.lineTo(...P(a, b)) : x.moveTo(...P(a, b)))); x.stroke();
  x.globalAlpha = 1;
  // patikalar
  x.lineWidth = 0.6; x.setLineDash([]);
  for (const p of PATHS) {
    for (const side of [-1, 1]) {
      x.beginPath();
      p.pts.forEach(([a, b], i) => {
        const nxt = p.pts[Math.min(i + 1, p.pts.length - 1)], prv = p.pts[Math.max(i - 1, 0)];
        let tx = nxt[0] - prv[0], tz = nxt[1] - prv[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        const q = P(a - tz * side * p.w / 2, b + tx * side * p.w / 2);
        i ? x.lineTo(...q) : x.moveTo(...q);
      });
      x.stroke();
    }
  }
  // parsel sınırı (kesik çizgi)
  x.lineWidth = 1.4; x.setLineDash([8, 3, 2, 3]);
  x.beginPath(); x.moveTo(...P(...SW_CORNER)); x.lineTo(...P(...APEX)); x.lineTo(...P(...SE_CORNER)); x.stroke();
  x.setLineDash([]);
  // ağaçlar
  x.lineWidth = 0.7;
  for (const t of SITE_TREES) {
    const r = (t.kind === 'pine' ? 3.4 : t.kind === 'olive' ? 2.4 : 1.8) * t.s * s;
    const [a, b] = P(t.x, t.z);
    x.beginPath();
    for (let k = 0; k <= 12; k++) { const an = (k / 12) * Math.PI * 2; const rr = r * (0.85 + 0.15 * Math.sin(an * 5 + t.x)); x.lineTo(a + Math.cos(an) * rr, b + Math.sin(an) * rr); }
    x.stroke();
  }
  // havuzlar (plandaki gibi koyu dolgu)
  for (const p of POOLS) {
    x.save();
    x.translate(...P(p.x, p.z)); x.rotate(-p.rot);
    x.beginPath();
    if (p.shape === 'rect') x.rect((-p.w / 2) * s, (-p.d / 2) * s, p.w * s, p.d * s);
    else {
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        const pinch = 1 - 0.42 * Math.exp(-Math.pow(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)), 2) / 0.22);
        x.lineTo(Math.cos(a) * p.w / 2 * s, Math.sin(a) * p.d / 2 * pinch * s);
      }
    }
    x.fillStyle = '#16213f'; x.fill();
    x.restore();
    const [a, b] = P(p.x, p.z + p.d / 2 + 3);
    label(x, 'HAVUZ', a, b + 4, 10, ink, 'mono');
  }
  // kameriye
  { const [a, b] = P(GAZEBO.x, GAZEBO.z); x.lineWidth = 1; x.beginPath(); x.arc(a, b, GAZEBO.r * s, 0, 7); x.stroke(); x.beginPath(); x.arc(a, b, GAZEBO.r * s * 0.45, 0, 7); x.stroke(); }
  // otopark
  {
    x.save(); x.translate(...P(PARKING.x, PARKING.z)); x.rotate(-PARKING.rot);
    x.lineWidth = 0.8; x.strokeRect((-PARKING.w / 2) * s, (-PARKING.d / 2) * s, PARKING.w * s, PARKING.d * s);
    for (let k = 0; k <= 10; k++) { x.beginPath(); x.moveTo((-15 + k * 3) * s, (-PARKING.d / 2) * s); x.lineTo((-15 + k * 3) * s, (-PARKING.d / 2 + 5) * s); x.stroke(); }
    x.restore();
    const [a, b] = P(PARKING.x, PARKING.z); label(x, 'O.P.', a, b + 3, 12, ink, 'display');
  }
  // duvarlar
  x.lineWidth = 1.1;
  for (const [a1, b1, a2, b2] of WALLS) { x.beginPath(); x.moveTo(...P(a1, b1)); x.lineTo(...P(a2, b2)); x.stroke(); }
  // binalar: taralı dikdörtgenler
  for (const bd of BUILDINGS) {
    x.save();
    x.translate(...P(bd.x, bd.z)); x.rotate(-bd.rot);
    const w = bd.w * s, h = bd.d * s;
    x.fillStyle = 'rgba(44,74,149,0.12)';
    x.fillRect(-w / 2, -h / 2, w, h);
    x.lineWidth = 1.2; x.strokeRect(-w / 2, -h / 2, w, h);
    x.beginPath(); x.rect(-w / 2, -h / 2, w, h); x.clip();
    x.lineWidth = 0.5;
    for (let k = -w - h; k < w + h; k += 4) { x.beginPath(); x.moveTo(-w / 2 + k, -h / 2); x.lineTo(-w / 2 + k + h, h / 2); x.stroke(); }
    if (bd.type === 'S' || bd.type === 'E' || bd.type === 'M') { x.lineWidth = 0.9; x.beginPath(); x.moveTo(0, -h / 2); x.lineTo(0, h / 2); x.stroke(); }
    x.restore();
  }
  for (const bd of BUILDINGS) {
    if (!['S', 'E', 'M'].includes(bd.type)) continue;
    const [a, b] = P(bd.x, bd.z);
    const n = bd.label.replace(/^[SEM]/, '');
    label(x, n, a, b, Math.max(8, Math.min(11, s * 2.4)), ink, 'mono', true);
  }
  // büyük harfli bölge etiketleri (planda daire içinde)
  const circ = (t, wx, wz) => {
    const [a, b] = P(wx, wz);
    const r = Math.max(9, 3.2 * s);
    x.fillStyle = opts.paper || '#ebe2cc'; x.beginPath(); x.arc(a, b, r, 0, 7); x.fill();
    x.lineWidth = 1.3; x.strokeStyle = ink; x.beginPath(); x.arc(a, b, r, 0, 7); x.stroke();
    label(x, t, a, b + 1, r * 1.15, ink, 'display');
  };
  const byType = (t) => BUILDINGS.find((b) => b.type === t);
  circ('S', -16, -6); circ('E', 64, -44);
  { const m = BUILDINGS.filter((b) => b.type === 'M')[2]; circ('M', m.x - 7, m.z - 3); }
  for (const t of ['G', 'R', 'D', 'K']) { const b = byType(t); circ(t, b.x, b.z); }
  circ('T', TEA_GARDEN.x, TEA_GARDEN.z); circ('T', PLAYGROUND.x, PLAYGROUND.z);
  // metin etiketleri
  x.fillStyle = ink;
  label(x, 'sahil yolu', ...P(-100, (ROAD_Z0 + ROAD_Z1) / 2 + 0.6), 11, ink, 'mono');
  label(x, 'kıyı çizgisi', ...P(70, shoreZ(70) - 3), 10, ink, 'mono');
  label(x, 'yeni yapılan bağlantı yolu', ...P(-26, -95), 10, ink, 'mono', false, -0.69);
  label(x, 'arsa sınırı', ...P(95, -62), 10, ink, 'mono', false, -1.44);
  label(x, 'BEKÇİ-KABUL', ...P(-84, 22), 9, ink, 'mono');
  label(x, 'BÜFE', ...P(40, 21), 9, ink, 'mono');
  label(x, 'ÇİÇEK SERASI', ...P(38, -88), 9, ink, 'mono');
  label(x, 'ÇOCUK BAHÇESİ', ...P(PLAYGROUND.x, PLAYGROUND.z + 7), 9, ink, 'mono');
  label(x, 'ÇAY BAHÇESİ', ...P(TEA_GARDEN.x, TEA_GARDEN.z + 6.5), 9, ink, 'mono');
  label(x, 'DENİZ SPORLARI', ...P(22, 54), 9, ink, 'mono');
  label(x, 'ŞARAP ÇEŞMESİ', ...P(52, 11), 9, ink, 'mono');
  // kuzey oku (planın sağ üstü)
  {
    const a = W - 44, b = 50;
    x.lineWidth = 1; x.beginPath(); x.arc(a, b, 24, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(a, b - 22); x.lineTo(a + 8, b + 8); x.lineTo(a, b + 2); x.closePath(); x.fill();
    label(x, 'K', a, b - 32, 14, ink, 'display');
  }
  // ölçek
  {
    const L = 20 * s, a = 24, b = H - 22;
    x.lineWidth = 1.2; x.beginPath(); x.moveTo(a, b); x.lineTo(a + L, b); x.moveTo(a, b - 4); x.lineTo(a, b + 4); x.moveTo(a + L, b - 4); x.lineTo(a + L, b + 4); x.stroke();
    label(x, '20 m', a + L / 2, b - 9, 10, ink, 'mono');
  }
  // oyuncu
  if (opts.player) {
    const [a, b] = P(opts.player.x, opts.player.z);
    x.save(); x.translate(a, b); x.rotate(-opts.player.yaw);
    x.fillStyle = '#b3462c'; x.beginPath(); x.moveTo(0, -11); x.lineTo(7, 7); x.lineTo(0, 3); x.lineTo(-7, 7); x.closePath(); x.fill();
    x.restore();
    label(x, 'SEN', a, b + 18, 11, '#b3462c', 'display');
  }
}

function label(x, t, a, b, size, color, font, bg = false, rot = 0) {
  x.save();
  x.translate(a, b); if (rot) x.rotate(rot);
  x.font = font === 'display' ? `${size}px "Saira Stencil One", "Arial Black", sans-serif` : `500 ${size}px "IBM Plex Mono", monospace`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (bg) { const w = x.measureText(t).width; x.fillStyle = 'rgba(235,226,204,0.85)'; x.fillRect(-w / 2 - 2, -size / 2, w + 4, size); }
  x.fillStyle = color; x.fillText(t, 0, 0);
  x.restore();
}
