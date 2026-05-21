require('dotenv').config();

const {
  app, BrowserWindow, Tray, Menu, screen,
  nativeImage, ipcMain, desktopCapturer,
} = require('electron');
const path = require('path');
const fs   = require('fs');
const { deflateSync } = require('zlib');

const isDev = process.argv.includes('--dev');
const WIN_W = 200;
const WIN_H = 250;

let tray = null;
let win  = null;

// ---------------------------------------------------------------------------
// User-data paths (persisted across launches)
// ---------------------------------------------------------------------------
const USER_DATA     = app.getPath('userData');
const AUTH_FILE     = path.join(USER_DATA, 'petto-auth.json');
const USAGE_FILE    = path.join(USER_DATA, 'petto-usage.json');
const SETTINGS_FILE = path.join(USER_DATA, 'petto-settings.json');

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
const SUPA_URL  = 'https://vbeujywkmrzldmvznojd.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZiZXVqeXdrbXJ6bGRtdnpub2pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjY5MjMsImV4cCI6MjA5NDYwMjkyM30.hZM1Vk5fIXz2zgShr4qnUiRjcLwbAJD1duEGjnexCzQ';

// ---------------------------------------------------------------------------
// Tier config
// ---------------------------------------------------------------------------
const TIER_LIMITS = {
  pro:  { daily: 150, pets: ['cat', 'monkey', 'dog', 'fox', 'ghost'] },
  free: { daily: 50,  pets: ['cat', 'monkey'] },
};

const ALL_PETS = [
  { id: 'cat',    label: '🐱 Cat' },
  { id: 'monkey', label: '🐵 Monkey' },
  { id: 'dog',    label: '🐶 Dog' },
  { id: 'fox',    label: '🦊 Fox' },
  { id: 'ghost',  label: '👻 Ghost' },
];

// In-memory tier + active-pet state (loaded/refreshed on launch)
let currentTier = 'free';
let activePet   = 'cat';

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function writeJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data), 'utf8'); } catch {}
}

// ---------------------------------------------------------------------------
// Auth (access + refresh tokens stored after petto:// deep link)
// ---------------------------------------------------------------------------
function getAuth()        { return readJson(AUTH_FILE, null); }
function saveAuth(tokens) { writeJson(AUTH_FILE, tokens); }

// ---------------------------------------------------------------------------
// Daily usage counter — resets when the date changes
// ---------------------------------------------------------------------------
function todayStr() { return new Date().toISOString().slice(0, 10); }

function getUsage() {
  const u = readJson(USAGE_FILE, {});
  return u.date === todayStr() ? u : { date: todayStr(), count: 0 };
}

function incrementUsage() {
  const u = getUsage();
  u.count += 1;
  writeJson(USAGE_FILE, u);
  return u.count;
}

// ---------------------------------------------------------------------------
// Settings (active pet selection)
// ---------------------------------------------------------------------------
function loadSettings() {
  const s = readJson(SETTINGS_FILE, {});
  // Saved pet might be invalid for the current tier — fall back to cat
  const allowed = (TIER_LIMITS[currentTier] ?? TIER_LIMITS.free).pets;
  activePet = allowed.includes(s.active_pet) ? s.active_pet : 'cat';
}

function saveSettings() {
  writeJson(SETTINGS_FILE, { active_pet: activePet });
}

// ---------------------------------------------------------------------------
// Supabase tier fetch — reads profiles.tier for the signed-in user
// ---------------------------------------------------------------------------
async function fetchTierFromSupabase(access_token) {
  const res = await fetch(`${SUPA_URL}/rest/v1/profiles?select=tier&limit=1`, {
    headers: {
      'apikey': SUPA_ANON,
      'Authorization': `Bearer ${access_token}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.tier ?? 'free';
}

// Called on every launch (and after a successful deep-link login).
// Fetches tier from Supabase, validates the active pet, then refreshes the tray.
async function refreshTier() {
  const auth = getAuth();
  if (!auth?.access_token) {
    currentTier = 'free';
    updateTrayMenu();
    return;
  }
  try {
    const tier = await fetchTierFromSupabase(auth.access_token);
    if (tier) {
      currentTier = tier;
      console.log(`[tier] fetched: ${tier}`);
    }
  } catch (e) {
    console.log('[tier] fetch failed — keeping free tier:', e.message);
  }

  // If the saved pet is no longer allowed after a tier downgrade, reset it
  const allowed = (TIER_LIMITS[currentTier] ?? TIER_LIMITS.free).pets;
  if (!allowed.includes(activePet)) {
    activePet = 'cat';
    saveSettings();
    if (win && !win.isDestroyed()) win.webContents.send('pet-changed', 'cat');
  }

  updateTrayMenu();
}

// ---------------------------------------------------------------------------
// petto:// deep-link handler (receives auth tokens from the website)
// ---------------------------------------------------------------------------
// Register the protocol client before app is ready (required by Electron docs)
if (process.defaultApp) {
  // Dev: launched via `electron .` — pass the script path so the OS knows the handler
  if (process.argv.length >= 2)
    app.setAsDefaultProtocolClient('petto', process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient('petto');
}

function handleDeepLink(url) {
  try {
    const u = new URL(url);
    const access_token  = u.searchParams.get('access_token');
    const refresh_token = u.searchParams.get('refresh_token');
    if (access_token && refresh_token) {
      saveAuth({ access_token, refresh_token });
      console.log('[auth] session stored via deep link');
      refreshTier();
    }
  } catch (e) {
    console.log('[auth] deep-link parse error:', e.message);
  }
}

// Single-instance lock — Windows/Linux pass the petto:// URL via argv of the
// second instance; the first instance receives it via 'second-instance'.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_, argv) => {
    const url = argv.find(a => a.startsWith('petto://'));
    if (url) handleDeepLink(url);
    if (win) { win.show(); win.focus(); }
  });
}

// macOS delivers the URL via 'open-url' before the app is fully ready
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

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
  const lenBuf  = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const crcBuf  = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createTrayIcon() {
  const size = 16;
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const r  = size / 2 - 1;
  const rowLen = 1 + size * 4;
  const raw    = Buffer.alloc(size * rowLen, 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
      const i = y * rowLen + 1 + x * 4;
      raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255;
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
  const x = workArea.x + workArea.width  - WIN_W;
  const y = workArea.y + workArea.height - WIN_H;

  win = new BrowserWindow({
    width: WIN_W, height: WIN_H, x, y,
    transparent: true, frame: false,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false, maximizable: false, minimizable: false,
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
  const allowed = (TIER_LIMITS[currentTier] ?? TIER_LIMITS.free).pets;

  const petItems = ALL_PETS.map(p => ({
    label: allowed.includes(p.id)
      ? (activePet === p.id ? `✓ ${p.label}` : `   ${p.label}`)
      : `🔒 ${p.label}`,
    enabled: allowed.includes(p.id),
    click: () => {
      activePet = p.id;
      saveSettings();
      if (win && !win.isDestroyed()) win.webContents.send('pet-changed', p.id);
      updateTrayMenu();
    },
  }));

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: win?.isVisible() ? 'Hide Pet' : 'Show Pet',
      click: () => {
        if (win?.isVisible()) win.hide(); else win.show();
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    { label: `Plan: ${currentTier === 'pro' ? 'Pro ✨' : 'Free'}`, enabled: false },
    { type: 'separator' },
    ...petItems,
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Petto');
  updateTrayMenu();
}

// ---------------------------------------------------------------------------
// Screen capture — main process only; desktopCapturer fails in isolated renderer
// ---------------------------------------------------------------------------
ipcMain.handle('capture-screen', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1280, height: 4096 },
  });
  const primary = sources[0];
  if (!primary) return null;
  return primary.thumbnail.toJPEG(85).toString('base64');
});

// ---------------------------------------------------------------------------
// Claude API call — main process only (avoids renderer CORS restrictions)
// Enforces the tier daily limit here (server-side; renderer can't bypass it).
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
  // Check daily reaction limit before hitting the API
  const usage = getUsage();
  const limit = (TIER_LIMITS[currentTier] ?? TIER_LIMITS.free).daily;
  if (usage.count >= limit) {
    const msg = currentTier === 'pro'
      ? `${limit} reactions used today. Back tomorrow!`
      : `Free limit (${limit}/day) reached. Upgrade to Pro for 3×!`;
    return JSON.stringify({ emotion: 'sleeping', text: msg, incognito: false });
  }
  incrementUsage();

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
// IPC: tier info for the renderer
// ---------------------------------------------------------------------------
ipcMain.handle('get-tier', () => ({
  tier:       currentTier,
  activePet,
  dailyLimit: (TIER_LIMITS[currentTier] ?? TIER_LIMITS.free).daily,
  usageToday: getUsage().count,
}));

// ---------------------------------------------------------------------------
// IPC helpers — give the renderer a way to write to the terminal
// ---------------------------------------------------------------------------
const ts = () => new Date().toLocaleTimeString();

ipcMain.on('log', (_, msg) => console.log(`[pet] ${ts()} ${msg}`));

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
  // If launched directly via petto:// (Windows/Linux first-time deep link)
  const deepLinkUrl = process.argv.find(a => a.startsWith('petto://'));
  if (deepLinkUrl) handleDeepLink(deepLinkUrl);

  // Load saved pet preference before building the tray
  loadSettings();

  createWindow();
  createTray();
  startScreenshotLoop();

  // Fetch fresh tier from Supabase in the background (non-blocking)
  refreshTier();
});

app.on('window-all-closed', () => {});
