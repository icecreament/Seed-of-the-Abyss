const { contextBridge, ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('electron-shell');
});

// Desktop-only bridge used by the settings scene / boot restore (see src/vite-env.d.ts).
contextBridge.exposeInMainWorld('seedDesktop', {
  isElectron: true,
  setFullscreen: (flag) => ipcRenderer.invoke('seed:set-fullscreen', flag),
  isFullscreen: () => ipcRenderer.invoke('seed:is-fullscreen'),
  setWindowSize: (w, h) => ipcRenderer.invoke('seed:set-window-size', w, h),
  onFullscreenChanged: (cb) => {
    const listener = (_e, flag) => cb(Boolean(flag));
    ipcRenderer.on('seed:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('seed:fullscreen-changed', listener);
  },
  onWindowSizeChanged: (cb) => {
    const listener = (_e, w, h) => cb(Number(w), Number(h));
    ipcRenderer.on('seed:window-size-changed', listener);
    return () => ipcRenderer.removeListener('seed:window-size-changed', listener);
  },
});
