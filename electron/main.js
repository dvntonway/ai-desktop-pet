require('dotenv').config();

const {
  app, BrowserWindow, Tray, Menu, screen,
  nativeImage, ipcMain, desktopCapturer,
} = require('electron');
const path = require('path');
const { deflateSync } = require('zlib');

const isDev = process.argv.includes('--dev');
const WIN_W = 200;
const WIN_H = 250;

let tray = null;
let win = null;

// ---------------------------------------------------------------------------
// Tray icon: generate a 16x16 white circle PNG in pure JS (no asset files)
// ---------------------------------------------------------------------------
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createTrayIcon() {
  const size = 16;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const r = size / 2 - 1;
  const rowLen = 1 + size * 4;
  const raw = Buffer.alloc(size * rowLen, 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
      const i = y * rowLen + 1 + x * 4;
      raw[i] = 255;
      raw[i + 1] = 255;
      raw[i + 2] = 255;
      raw[i + 3] = inside ? 255 : 0;
    }
  }

  return nativeImage.createFromBuffer(Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]));
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const x = workArea.x + workArea.width - WIN_W;
  const y = workArea.y + workArea.height - WIN_H;

  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function updateTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: win?.isVisible() ? 'Hide Pet' : 'Show Pet',
      click: () => {
        if (win?.isVisible()) win.hide(); else win.show();
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('AI Desktop Pet');
  updateTrayMenu();
}

// ---------------------------------------------------------------------------
// Screen capture — handled here in the main process where desktopCapturer
// works reliably. Calling it from the preload's isolated context fails silently.
// Returns a base64 JPEG string (already resized to 1280 px wide by thumbnailSize).
// ---------------------------------------------------------------------------
ipcMain.handle('capture-screen', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 4096 }, // width is the binding constraint
  });
  const primary = sources[0];
  if (!primary) return null;
  return primary.thumbnail.toJPEG(85).toString('base64');
});

// ---------------------------------------------------------------------------
// Claude API call — handled here in main to avoid renderer CORS restrictions.
// Anthropic's API does not send Access-Control-Allow-Origin headers.
// ---------------------------------------------------------------------------
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT =
  'You are a witty, judgmental pet living on the user\'s screen. ' +
  'Look at this screenshot and respond ONLY in valid JSON, no markdown, no backticks: ' +
  '{ "emotion": one of [happy, judging, shocked, proud, bored, sleeping], ' +
  '"text": one short witty line max 8 words about what the user is doing, ' +
  '"incognito": false } ' +
  'or if you see an incognito/private browser window: { "incognito": true }';

ipcMain.handle('call-claude', async (_, base64Jpeg) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Jpeg } },
          { type: 'text', text: 'What is the user doing on their screen?' },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Anthropic ${res.status}: ${body.error?.message ?? res.statusText}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('unexpected Anthropic response shape');
  return text;
});

// ---------------------------------------------------------------------------
// IPC helpers — give the renderer a way to write to the terminal
// ---------------------------------------------------------------------------
const ts = () => new Date().toLocaleTimeString();

// General progress / error messages from renderer → terminal
ipcMain.on('log', (_, msg) => console.log(`[pet] ${ts()} ${msg}`));

// Final AI response from renderer → terminal
ipcMain.on('screenshot-taken', (_, json) => {
  if (json) {
    console.log(`[pet] ${ts()}`, json);
  } else {
    console.log(`[pet] ${ts()} screenshot taken`);
  }
});

// ---------------------------------------------------------------------------
// Screenshot loop — ticks every 15 s; renderer does the actual AI call
// ---------------------------------------------------------------------------
const SCREENSHOT_INTERVAL_MS = 15_000;

function startScreenshotLoop() {
  console.log('[pet] screenshot loop started — first tick in 15 s');
  setInterval(() => {
    if (win && !win.isDestroyed()) {
      console.log(`[pet] ${ts()} tick`);
      win.webContents.send('tick');
    }
  }, SCREENSHOT_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
if (app.dock) app.dock.hide();

app.whenReady().then(() => {
  createWindow();
  createTray();
  startScreenshotLoop();
});

app.on('window-all-closed', () => {});
