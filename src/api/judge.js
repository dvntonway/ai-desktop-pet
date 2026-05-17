// Strip markdown fences the model might add despite the system prompt
function extractJson(raw) {
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  return JSON.parse(cleaned);
}

async function takeAndJudge() {
  try {
    const base64Jpeg = await window.electronAPI.captureScreen();
    if (!base64Jpeg) throw new Error('captureScreen returned null — no display sources found');

    window.electronAPI.log('screenshot captured — calling Claude...');

    const raw = await window.electronAPI.callClaude(base64Jpeg);
    const json = extractJson(raw);
    window.electronAPI.notifyScreenshotTaken(json);
    listeners.forEach(cb => cb(json));

  } catch (err) {
    window.electronAPI.log(`error: ${err.message}`);
  }
}

const listeners = [];

export function onJudgement(cb) {
  listeners.push(cb);
  return () => {
    const i = listeners.indexOf(cb);
    if (i !== -1) listeners.splice(i, 1);
  };
}

let initialized = false;

export function initLoop() {
  if (initialized) return;
  initialized = true;
  window.electronAPI.onTick(takeAndJudge);
}
