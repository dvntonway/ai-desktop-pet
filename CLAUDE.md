# AI Desktop Pet

## What this is
An Electron desktop app. A pet character lives on the screen, always-on-top. 
Every 15 seconds it screenshots the screen, sends it to Claude Haiku vision API, 
gets back an emotion + one witty line, and the pet reacts.

## Tech Stack
- Electron (desktop shell)
- React + Tailwind (UI)
- Claude Haiku with vision (brain)
- active-win (get current app name as extra context)

## Pet behavior
- Always on top, transparent background, frameless window, not in taskbar
- Sits bottom-right corner, draggable
- 6 emotions: happy, judging, shocked, proud, bored, sleeping
- Shows SVG face + speech bubble for 6 seconds after each reaction
- If Claude returns incognito: true → hide the pet completely

## API Response format
Claude must always return valid JSON only:
{ "emotion": "judging", "text": "Really? Reddit again?", "incognito": false }
or
{ "incognito": true }

## File structure
electron/main.js — main process, always-on-top window, 15s screenshot loop
electron/preload.js — context bridge
src/App.jsx — pet UI
src/components/PetFace.jsx — SVG expressions for all 6 emotions  
src/components/SpeechBubble.jsx — shows text for 6s then fades
src/api/judge.js — takes screenshot + active app → calls Claude Haiku → returns JSON
.env — ANTHROPIC_API_KEY (never commit this)

## Important rules
- Never use form tags, use onClick handlers
- Keep the pet window 200x250px max
- Screenshot should be resized to 1280px wide before sending to API to save tokens
- Incognito detection happens inside the Claude prompt by reading the screenshot