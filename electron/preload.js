const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Tick from main process — renderer registers its handler here
  onTick: (callback) => ipcRenderer.on('tick', callback),

  // Screen capture: delegated to main process where desktopCapturer works reliably.
  // Resolves to a base64 JPEG string (1280 px wide) or null.
  captureScreen: () => ipcRenderer.invoke('capture-screen'),

  // Call Claude API from main process (avoids renderer CORS restrictions)
  callClaude: (base64Jpeg) => ipcRenderer.invoke('call-claude', base64Jpeg),

  // Forward a log message to the terminal via main process
  log: (msg) => ipcRenderer.send('log', msg),

  // Send the final parsed AI JSON to the terminal
  notifyScreenshotTaken: (json) => ipcRenderer.send('screenshot-taken', json),
});
