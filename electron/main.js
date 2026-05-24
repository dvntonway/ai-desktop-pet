const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');

// Load .env without dotenv — works in both dev and packaged builds.
// Dev:       ../relative to electron/ == project root
// Packaged:  electron-builder copies .env into resources/; process.resourcesPath points there.
for (const envPath of [
  path.join(__dirname, '../.env'),
  process.resourcesPath && path.join(process.resourcesPath, '.env'),
].filter(Boolean)) {
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0 && !line.startsWith('#')) {
        const k = line.slice(0, i).trim();
        if (k && !(k in process.env)) process.env[k] = line.slice(i + 1).trim();
      }
    }
    break;
  } catch {}
}

const {
  app, BrowserWindow, Tray, Menu, screen,
  nativeImage, ipcMain, desktopCapturer, shell,
} = require('electron');
const { autoUpdater } = require('electron-updater');

const isDev = process.argv.includes('--dev');
const WIN_W      = 200;
const WIN_H      = 250;
const WIN_H_GHOST = 290; // ghost SVG is taller to keep mouth inside the body

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
const SUPA_URL  = process.env.SUPABASE_URL      || 'https://vbeujywkmrzldmvznojd.supabase.co';
const SUPA_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZiZXVqeXdrbXJ6bGRtdnpub2pkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjY5MjMsImV4cCI6MjA5NDYwMjkyM30.hZM1Vk5fIXz2zgShr4qnUiRjcLwbAJD1duEGjnexCzQ';

// Stable device fingerprint — sent with every judge call so the server can
// detect multi-account trial abuse on the same machine.
// SHA-256(hostname::username) truncated to 32 hex chars (128-bit).
const DEVICE_ID = crypto.createHash('sha256')
  .update(`${os.hostname()}::${os.userInfo().username}`)
  .digest('hex')
  .slice(0, 32);

// ---------------------------------------------------------------------------
// Tier config
// ---------------------------------------------------------------------------
// All active users (trial or pro) share the same limits.
// Trial = first 24 h after signup; Pro = paid subscriber.
const ACTIVE_LIMIT = 150;
const ALL_PETS_IDS = ['cat', 'monkey', 'dog', 'fox', 'ghost'];

const ALL_PETS = [
  { id: 'cat',    label: '🐱 Cat' },
  { id: 'monkey', label: '🐵 Monkey' },
  { id: 'dog',    label: '🐶 Dog' },
  { id: 'fox',    label: '🦊 Fox' },
  { id: 'ghost',  label: '👻 Ghost' },
];

// In-memory tier + active-pet state (loaded/refreshed on launch)
let currentTier   = 'trial'; // 'trial' | 'pro'
let trialExpired  = false;   // true once the 24 h window closes without upgrade
let deviceBlocked = false;   // true if device hit the multi-account trial limit (session-only)
let activePet     = 'cat';
let shutUpMode    = false;   // when true, skip API and cycle random emotions silently
let warned50Date  = null;    // tracks which calendar day the 50-remaining warning fired

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
  const s      = readJson(SETTINGS_FILE, {});
  activePet  = ALL_PETS_IDS.includes(s.active_pet) ? s.active_pet : 'cat';
  shutUpMode = s.shut_up ?? false;
  // trialExpired is NOT loaded from disk — trial status is authoritative in
  // Supabase (profiles.trial_started_at). The flag is session-only so that
  // signing out and back in re-evaluates against the server on the next tick.
}

function saveSettings() {
  writeJson(SETTINGS_FILE, {
    active_pet: activePet,
    shut_up:    shutUpMode,
  });
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
// Fetches tier from Supabase and refreshes the tray.
async function refreshTier() {
  const auth = getAuth();
  if (!auth?.access_token) {
    currentTier = 'trial';
    updateTrayMenu();
    return;
  }
  try {
    const tier = await fetchTierFromSupabase(auth.access_token);
    if (tier === 'pro') {
      currentTier = 'pro';
      // Clear any blocking flags now that the user has upgraded.
      if (trialExpired) {
        trialExpired = false;
        console.log('[tier] upgraded to Pro — trial-expired flag cleared');
      }
      if (deviceBlocked) {
        deviceBlocked = false;
        console.log('[tier] upgraded to Pro — device-blocked flag cleared');
      }
    } else {
      currentTier = 'trial';
    }
    console.log(`[tier] fetched: ${tier} → currentTier: ${currentTier}`);
  } catch (e) {
    console.log('[tier] fetch failed — keeping current tier:', e.message);
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
    // The login page sends tokens as a hash fragment:
    //   petto://auth/callback#access_token=...&refresh_token=...
    // Fall back to query params for any future flows that use ?access_token=...
    const params = (u.hash && u.hash.length > 1)
      ? new URLSearchParams(u.hash.slice(1))
      : u.searchParams;
    const access_token  = params.get('access_token');
    const refresh_token = params.get('refresh_token');
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
    if (win && !win.isDestroyed()) { win.show(); win.focus(); }
  });
}

// macOS delivers the URL via 'open-url' before the app is fully ready
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});


function createTrayIcon() {
  // Dev:      electron/__dirname/../build/icon.png  (source tree)
  // Packaged: process.resourcesPath/icon.png        (extraResources target)
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '../build/icon.png');
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) {
    console.warn('createTrayIcon: icon file missing or unreadable at', iconPath);
  }
  return img;
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const h = activePet === 'ghost' ? WIN_H_GHOST : WIN_H;
  const x = workArea.x + workArea.width  - WIN_W;
  const y = workArea.y + workArea.height - h;

  win = new BrowserWindow({
    width: WIN_W, height: h, x, y,
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
    win.loadURL('http://localhost:5174');
  } else {
    win.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  }
}

// Resize the window (and keep it anchored to the bottom-right corner) whenever
// the user switches between ghost (290 px tall) and any other pet (250 px tall).
function applyPetWindowSize() {
  if (!win || win.isDestroyed()) return;
  const h = activePet === 'ghost' ? WIN_H_GHOST : WIN_H;
  const { workArea } = screen.getPrimaryDisplay();
  const [x] = win.getPosition();
  const y = Math.max(workArea.y, workArea.y + workArea.height - h);
  win.setBounds({ x, y, width: WIN_W, height: h }, false);
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

// Shared menu template — used by both the tray and the window right-click menu.
function buildMenuTemplate() {
  // All active users get every pet; no tier-based locks.
  const petItems = ALL_PETS.map(p => ({
    label:   p.label,
    type:    'checkbox',
    checked: activePet === p.id,
    click: () => {
      activePet = p.id;
      saveSettings();
      applyPetWindowSize();
      if (win && !win.isDestroyed()) win.webContents.send('pet-changed', p.id);
      updateTrayMenu();
    },
  }));

  const isSignedIn = !!getAuth()?.access_token;
  const loginUrl   = `https://pettoai.netlify.app/login.html`
    + `?supabase_url=${encodeURIComponent(SUPA_URL)}`
    + `&anon_key=${encodeURIComponent(SUPA_ANON)}`
    + `&redirect_to=${encodeURIComponent('https://pettoai.netlify.app/callback.html')}`;
  const upgradeUrl = 'https://pettoai.netlify.app/#pricing';

  return [
    {
      label: (win && !win.isDestroyed() && win.isVisible()) ? 'Hide Pet' : 'Show Pet',
      click: () => {
        if (win && !win.isDestroyed()) {
          if (win.isVisible()) win.hide(); else win.show();
        }
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    // Plan / trial status row
    ...(deviceBlocked ? [
      { label: 'Device limit reached', enabled: false },
      { label: 'Upgrade to Pro →',     click: () => shell.openExternal(upgradeUrl) },
    ] : trialExpired ? [
      { label: 'Trial ended',      enabled: false },
      { label: 'Upgrade to Pro →', click: () => shell.openExternal(upgradeUrl) },
    ] : [
      { label: currentTier === 'pro' ? 'Plan: Pro ✨' : 'Plan: Trial', enabled: false },
    ]),
    // Auth row
    ...(!isSignedIn ? [{
      label: 'Sign In…',
      click: () => shell.openExternal(loginUrl),
    }] : [
      {
        // Re-fetches tier from Supabase — fixes the case where payment succeeded
        // but the app didn't receive the update (e.g. no internet at purchase time).
        label: 'Restore Purchase',
        click: async () => {
          console.log('[tier] Restore Purchase — re-fetching tier from Supabase');
          await refreshTier();
        },
      },
      {
        label: 'Sign Out',
        click: () => {
          const authPath = path.join(app.getPath('userData'), 'petto-auth.json');
          try { fs.unlinkSync(authPath); } catch {}
          currentTier   = 'trial';
          trialExpired  = false; // reset session flags; server re-evaluates on next tick
          deviceBlocked = false;
          updateTrayMenu();
          console.log('[auth] signed out');
        },
      },
    ]),
    { type: 'separator' },
    {
      label:   'Shut Up',
      type:    'checkbox',
      checked: shutUpMode,
      click: () => {
        shutUpMode = !shutUpMode;
        saveSettings();
        if (win && !win.isDestroyed()) win.webContents.send('shut-up-changed', shutUpMode);
        updateTrayMenu();
      },
    },
    // Only show pet picker when the app is fully usable (no blocking state)
    ...(!trialExpired && !deviceBlocked ? [
      { type: 'separator' },
      ...petItems,
    ] : []),
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ];
}

function updateTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}

function createTray() {
  tray = new Tray(createTrayIcon());
  console.log('tray created', 'icon empty:', tray.isDestroyed());
  tray.setToolTip('Petto');
  updateTrayMenu();

  // Ensure the context menu pops up on both left- and right-click on Windows
  tray.on('click',       () => tray.popUpContextMenu());
  tray.on('right-click', () => tray.popUpContextMenu());
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
// AI judgement — proxied through the Supabase Edge Function "judge".
// Anthropic key, rate-limiting, and tier enforcement all live server-side.
// ---------------------------------------------------------------------------
const JUDGE_URL = `${SUPA_URL}/functions/v1/judge`;

ipcMain.handle('call-claude', async (_, base64Jpeg) => {
  // If trial already confirmed expired this session, skip the network call.
  if (trialExpired) {
    return JSON.stringify({
      emotion: 'sleeping',
      text: 'Your free trial has ended. Upgrade to Pro to wake me up 🐾',
      incognito: false,
    });
  }

  // If this device was already flagged for multi-account abuse this session, skip.
  if (deviceBlocked) {
    return JSON.stringify({
      emotion: 'sleeping',
      text: 'Upgrade to Pro to continue 🐾',
      incognito: false,
    });
  }

  // Edge function requires a signed-in user (verify_jwt: true).
  const auth = getAuth();
  if (!auth?.access_token) {
    return JSON.stringify({ emotion: 'sleeping', text: 'Sign in to wake me up!', incognito: false });
  }

  // Client-side daily limit check — keeps the tray counter accurate without a round-trip.
  const usage = getUsage();
  if (usage.count >= ACTIVE_LIMIT) {
    return JSON.stringify({
      emotion: 'sleeping',
      text: `${ACTIVE_LIMIT} reactions used today. Back tomorrow!`,
      incognito: false,
    });
  }

  const newCount  = incrementUsage();
  const remaining = ACTIVE_LIMIT - newCount;

  // One-time warning when exactly 50 reactions remain for the day.
  if (remaining === 50 && warned50Date !== todayStr()) {
    warned50Date = todayStr();
    if (win && !win.isDestroyed()) {
      win.webContents.send('low-reactions', "I'm getting tired... I have 50 reactions left today 😴");
    }
  }

  console.log(`[call-claude] tier=${currentTier} trialExpired=${trialExpired} deviceBlocked=${deviceBlocked} usage=${newCount}/${ACTIVE_LIMIT} → calling judge`);

  const res = await fetch(JUDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey':        SUPA_ANON,
      'Authorization': `Bearer ${auth.access_token}`,
    },
    body: JSON.stringify({ image: base64Jpeg, deviceId: DEVICE_ID }),
  });

  // 403 can mean trial expired or device blocked — read the body to distinguish.
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.trialExpired) {
      trialExpired = true;  // session-only; not written to disk
      updateTrayMenu();
      console.log('[trial] expired — server confirmed via profiles.trial_started_at');
      return JSON.stringify({
        emotion: 'sleeping',
        text: 'Your free trial has ended. Upgrade to Pro to wake me up 🐾',
        incognito: false,
      });
    }
    if (body.deviceBlocked) {
      deviceBlocked = true;  // session-only; not written to disk
      updateTrayMenu();
      console.log('[device] blocked — too many trial accounts on this device within 7 days');
      return JSON.stringify({
        emotion: 'sleeping',
        text: 'Upgrade to Pro to continue 🐾',
        incognito: false,
      });
    }
  }

  // Server-side daily limit hit (client counter out of sync).
  if (res.status === 429) {
    return JSON.stringify({
      emotion: 'sleeping',
      text: `${ACTIVE_LIMIT} reactions used today. Back tomorrow!`,
      incognito: false,
    });
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`judge ${res.status}: ${body.error ?? res.statusText}`);
  }

  // Edge function returns the final JSON directly — pass the raw text back
  // so the renderer can parse it exactly as it did with the Anthropic response.
  return res.text();
});

// ---------------------------------------------------------------------------
// IPC: tier info for the renderer
// ---------------------------------------------------------------------------
ipcMain.handle('get-tier', () => ({
  tier:         currentTier,
  trialExpired,
  activePet,
  shutUp:       shutUpMode,
  dailyLimit:   ACTIVE_LIMIT,
  usageToday:   getUsage().count,
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

// IPC: renderer right-click → show custom menu at the cursor inside the window
ipcMain.on('show-context-menu', () => {
  Menu.buildFromTemplate(buildMenuTemplate()).popup({ window: win });
});

// IPC: manual drag — move the window by (dx, dy) pixels
ipcMain.on('move-window-by', (_, dx, dy) => {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
});

// ---------------------------------------------------------------------------
// Auto-updater — silently checks GitHub Releases on launch (packaged only).
// Downloads in the background; installs automatically on next quit.
// Sends 'update-ready' to the renderer so the pet can show a speech bubble.
// ---------------------------------------------------------------------------
function setupAutoUpdater() {
  autoUpdater.autoDownload        = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () =>
    console.log('[updater] checking for updates…'));
  autoUpdater.on('update-available', info =>
    console.log(`[updater] v${info.version} available — downloading`));
  autoUpdater.on('update-not-available', () =>
    console.log('[updater] already up to date'));
  autoUpdater.on('update-downloaded', info => {
    console.log(`[updater] v${info.version} downloaded — will install on next quit`);
    if (win && !win.isDestroyed())
      win.webContents.send('update-ready', info.version);
  });
  autoUpdater.on('error', err =>
    console.log('[updater] error:', err.message));

  autoUpdater.checkForUpdates().catch(err =>
    console.log('[updater] check failed:', err.message));
}

// ---------------------------------------------------------------------------
// Screenshot loop — ticks every 60 s; renderer does the actual AI call.
// When Shut Up mode is on, skips the API and sends a random emotion instead.
// ---------------------------------------------------------------------------
const SCREENSHOT_INTERVAL_MS = 60_000;
const EMOTIONS = ['happy', 'judging', 'shocked', 'proud', 'bored', 'sleeping'];

function sendTick() {
  if (!win || win.isDestroyed()) return;
  if (shutUpMode) {
    const emotion = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
    win.webContents.send('quiet-tick', emotion);
  } else {
    console.log(`[pet] ${ts()} tick`);
    win.webContents.send('tick');
  }
}

function startScreenshotLoop() {
  // Fire one tick immediately once the renderer has fully loaded so the pet
  // reacts on startup rather than waiting 60 s for the first interval tick.
  win.webContents.once('did-finish-load', () => {
    console.log('[pet] startup tick');
    sendTick();
    // Check for updates on every launch (packaged builds only — not in dev)
    if (!isDev) setupAutoUpdater();
  });
  console.log('[pet] screenshot loop started — ticking every 60 s');
  setInterval(sendTick, SCREENSHOT_INTERVAL_MS);
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
