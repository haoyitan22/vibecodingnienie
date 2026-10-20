const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

const W = 320, H = 300;
let win = null, tray = null;

if (!app.requestSingleInstanceLock()) app.quit();

function send(cmd) { if (win) win.webContents.send('cmd', cmd); }

function goHome() {
  const wa = screen.getPrimaryDisplay().workArea;
  win.setPosition(wa.x + wa.width - W - 40, wa.y + wa.height - H);
  send('home');
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: W, height: H,
    x: wa.x + wa.width - W - 40, y: wa.y + wa.height - H,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, maximizable: false, fullscreenable: false,
    backgroundColor: '#00000000', title: '捏捏猫',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // 透明的地方让鼠标穿过去，只有点到猫咪身上才算点它
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('pet.html');
  win.on('closed', () => { win = null; });
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 18, height: 18 });
  tray = new Tray(img);
  tray.setToolTip('捏捏猫');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '把猫咪叫回来', click: goHome },
    { label: '散步 / 别乱跑', click: () => send('walk-toggle') },
    { label: '睡觉 / 叫醒', click: () => send('sleep-toggle') },
    { type: 'separator' },
    { label: '退出捏捏猫', click: () => app.quit() },
  ]));
}

ipcMain.handle('info', () => {
  const [x, y] = win.getPosition();
  const d = screen.getDisplayNearestPoint({ x: x + W / 2, y: y + H / 2 });
  return { x, y, w: W, h: H, area: d.workArea };
});
ipcMain.on('move', (_e, x, y) => { if (win) win.setPosition(Math.round(x), Math.round(y)); });
ipcMain.on('set-ignore', (_e, ignore) => { if (win) win.setIgnoreMouseEvents(ignore, { forward: true }); });
ipcMain.on('menu', (_e, s) => {
  Menu.buildFromTemplate([
    { label: s.walking ? '乖乖待着' : '去散步吧', click: () => send('walk-toggle') },
    { label: s.sleeping ? '叫醒它' : '睡一会儿', click: () => send('sleep-toggle') },
    { label: '回到右下角', click: goHome },
    { type: 'separator' },
    { label: '退出捏捏猫', click: () => app.quit() },
  ]).popup({ window: win });
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  createWindow();
  createTray();
});
app.on('second-instance', () => { if (win) goHome(); });
app.on('window-all-closed', () => app.quit());
