// Mertur Savunması — masaüstü kabuğu. Oyun kodu tarayıcı sürümüyle aynıdır.
const { app, BrowserWindow, protocol, net, Menu, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

// Sürücü kara listesini atla, GPU'yu zorla kullan
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 900, minHeight: 560,
    backgroundColor: '#0b0d10', title: 'Mertur Savunması', autoHideMenuBar: true, fullscreen: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.loadURL('app://game/index.html');
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F12' && input.control) win.webContents.toggleDevTools();
  });
  win.once('ready-to-show', () => win.show());
  return win;
}

app.whenReady().then(() => {
  // app://game/... → proje klasörü; index.html'deki three.js CDN adresleri yerel kopyaya çevrilir
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT) || file.includes(`${path.sep}node_modules${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('yok', { status: 404 });
    if (p === '/index.html') {
      const html = fs.readFileSync(file, 'utf8').split(CDN).join('app://game/vendor/three/');
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
  const win = createWindow();
  globalShortcut.register('Alt+Enter', () => win.setFullScreen(!win.isFullScreen()));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
