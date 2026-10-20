const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  info: () => ipcRenderer.invoke('info'),
  move: (x, y) => ipcRenderer.send('move', x, y),
  setIgnore: ignore => ipcRenderer.send('set-ignore', ignore),
  menu: state => ipcRenderer.send('menu', state),
  onCommand: fn => ipcRenderer.on('cmd', (_e, cmd) => fn(cmd)),
});
