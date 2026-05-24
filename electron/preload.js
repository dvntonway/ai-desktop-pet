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

  // Tier + active-pet info (resolved once on mount, then kept via onPetChanged)
  getTier: () => ipcRenderer.invoke('get-tier'),

  // Fires whenever the user switches pets from the tray menu
  onPetChanged: (callback) => ipcRenderer.on('pet-changed', (_, petId) => callback(petId)),

  // Show the custom context menu at the current cursor position
  showContextMenu: () => ipcRenderer.send('show-context-menu'),

  // Move the window by a delta (used by manual drag implementation)
  moveWindowBy: (dx, dy) => ipcRenderer.send('move-window-by', dx, dy),

  // Fires when the user toggles Shut Up from the tray/context menu
  onShutUpChanged: (cb) => ipcRenderer.on('shut-up-changed', (_, on) => cb(on)),

  // Fires each tick while Shut Up is active — carries a pre-chosen random emotion
  onQuietTick: (cb) => ipcRenderer.on('quiet-tick', (_, emotion) => cb(emotion)),

  // Fires once per day when 50 reactions remain — carries the warning message
  onLowReactions: (cb) => ipcRenderer.on('low-reactions', (_, msg) => cb(msg)),

  // Fires when a new version has been downloaded and is ready to install on quit
  onUpdateReady: (cb) => ipcRenderer.on('update-ready', (_, version) => cb(version)),
});
