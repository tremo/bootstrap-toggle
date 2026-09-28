// Klavye, fare (pointer lock) ve dokunmatik girdiler
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.enabled = false;
    this.touch = { active: false, mx: 0, my: 0 };
    this.sens = 1;
    this.onLockChange = null;
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.ctrlKey && ['KeyW', 'KeyS', 'KeyD', 'KeyR'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.touch.active) { this.lock(); return; }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.mouse.left = this.mouse.right = false; this.keys.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; if (this.onLockChange) this.onLockChange(false, true); });
  }
  lock() {
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { this.canvas.requestPointerLock(); } catch (e) { this.lockFailed = true; } });
    } catch (e) { this.lockFailed = true; }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.mouse.dx = this.mouse.dy = 0; this.mouse.leftPressed = false; this.mouse.wheel = 0; }

  // Dokunmatik denetimler
  setupTouch(el) {
    this.touch.active = true;
    el.hidden = false;
    const stick = el.querySelector('#tStick'), knob = stick.querySelector('i'), look = el.querySelector('#tLook');
    let sid = null, sx = 0, sy = 0, lid = null, lx = 0, ly = 0;
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; sx = e.clientX; sy = e.clientY; stick.setPointerCapture(sid); });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId !== sid) return;
      const dx = Math.max(-50, Math.min(50, e.clientX - sx)), dy = Math.max(-50, Math.min(50, e.clientY - sy));
      this.touch.mx = dx / 50; this.touch.my = dy / 50;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
    });
    const endS = (e) => { if (e.pointerId !== sid) return; sid = null; this.touch.mx = this.touch.my = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', endS); stick.addEventListener('pointercancel', endS);
    look.addEventListener('pointerdown', (e) => { lid = e.pointerId; lx = e.clientX; ly = e.clientY; look.setPointerCapture(lid); });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lid) return;
      this.mouse.dx += (e.clientX - lx) * 2.2; this.mouse.dy += (e.clientY - ly) * 2.2;
      lx = e.clientX; ly = e.clientY;
    });
    const endL = (e) => { if (e.pointerId === lid) lid = null; };
    look.addEventListener('pointerup', endL); look.addEventListener('pointercancel', endL);
    const hold = (id, on, off) => {
      const b = el.querySelector(id);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); on(); });
      b.addEventListener('pointerup', () => off && off());
      b.addEventListener('pointercancel', () => off && off());
    };
    hold('#tFire', () => { this.mouse.left = true; this.mouse.leftPressed = true; }, () => { this.mouse.left = false; });
    hold('#tAim', () => { this.mouse.right = !this.mouse.right; });
    hold('#tReload', () => this.pressed.add('KeyR'));
    hold('#tJump', () => this.pressed.add('Space'));
    hold('#tCrouch', () => this.pressed.add('KeyC'));
    hold('#tSwap', () => { this.mouse.wheel += 1; });
    hold('#tNade', () => this.pressed.add('KeyG'));
    hold('#tNvg', () => this.pressed.add('KeyN'));
    hold('#tPause', () => this.pressed.add('Escape'));
  }
}
