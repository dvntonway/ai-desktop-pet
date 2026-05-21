// auth.js — session management for Petto
// Stores: { access_token, refresh_token, expires_at_ms } in localStorage under 'petto_session'
// No Supabase SDK — plain fetch only.

const SESSION_KEY = 'petto_session';

// ── Persistence ─────────────────────────────────────────────────────────────

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ── Token helpers ────────────────────────────────────────────────────────────

export function isExpired(session) {
  if (!session?.expires_at_ms) return true;
  // Treat as expired 60 s early to avoid edge-case failures
  return Date.now() > session.expires_at_ms - 60_000;
}

/** Parse a petto://auth/callback URL into a session object.
 *
 * Two formats are supported:
 *
 *   Hash   — petto://auth/callback#access_token=...   (direct Supabase redirect)
 *   Query  — petto://auth/callback?access_token=...   (relayed via callback.html,
 *             used because some OSes/browsers strip hash fragments from protocol URLs)
 *
 * Also accepts a bare "#access_token=..." or "access_token=..." string.
 */
export function parseCallbackHash(urlOrHash) {
  try {
    let paramStr = urlOrHash;

    if (paramStr.includes('#')) {
      // Hash takes priority (direct Supabase implicit-flow redirect)
      paramStr = paramStr.slice(paramStr.indexOf('#') + 1);
    } else if (paramStr.includes('?')) {
      // Query-string relay (callback.html → petto://auth/callback?...)
      paramStr = paramStr.slice(paramStr.indexOf('?') + 1);
    }
    // else: already a bare "key=value&..." string

    const params        = new URLSearchParams(paramStr);
    const access_token  = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const expires_in    = parseInt(params.get('expires_in') ?? '3600', 10);
    if (!access_token || !refresh_token) return null;
    return {
      access_token,
      refresh_token,
      expires_at_ms: Date.now() + expires_in * 1000,
    };
  } catch {
    return null;
  }
}

// ── Token refresh ────────────────────────────────────────────────────────────

/** Refresh an expired session. Returns a new session object or null on failure. */
export async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  try {
    const config = await window.electronAPI.getSupabaseConfig();
    const res = await fetch(
      `${config.url}/auth/v1/token?grant_type=refresh_token`,
      {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey':        config.anonKey,
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const refreshed = {
      access_token:  data.access_token,
      refresh_token: data.refresh_token ?? session.refresh_token,
      expires_at_ms: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    saveSession(refreshed);
    return refreshed;
  } catch {
    return null;
  }
}

// ── Auth URLs ────────────────────────────────────────────────────────────────

// The website callback page receives the Supabase redirect (tokens arrive in
// the URL #hash), then relays them to petto://auth/callback as ?query params.
// This two-hop approach is needed because:
//   1. Supabase requires an http(s) redirect URL for OAuth (no custom schemes).
//   2. The website page can then reliably open petto:// with tokens as query
//      params, which Windows passes intact through the CLI to the Electron instance.
const CALLBACK_PAGE = 'https://pettoai.netlify.app/callback.html';

export async function getGoogleAuthUrl() {
  const config = await window.electronAPI.getSupabaseConfig();
  const params = new URLSearchParams({
    provider:    'google',
    redirect_to: CALLBACK_PAGE,
  });
  return `${config.url}/auth/v1/authorize?${params}`;
}

export async function getEmailLoginUrl() {
  const config = await window.electronAPI.getSupabaseConfig();
  // login.html will redirect to CALLBACK_PAGE#access_token=... after auth
  return `https://pettoai.netlify.app/login.html?redirect_to=${encodeURIComponent(CALLBACK_PAGE)}&supabase_url=${encodeURIComponent(config.url)}&anon_key=${encodeURIComponent(config.anonKey)}`;
}
