import Lottie from 'lottie-react';
import catAnimation    from '../assets/Loader_cat.json';
import monkeyAnimation from '../assets/monkey.json';
import dogAnimation    from '../assets/dog.json';

// Lottie-animated pets (body/head/ears drawn by Lottie; emotion overlay drawn in SVG on top)
const LOTTIE_MAP = {
  cat:    catAnimation,
  monkey: monkeyAnimation,
  dog:    dogAnimation,
};

export const EMOTIONS = ['happy', 'judging', 'shocked', 'proud', 'bored', 'sleeping'];

// ─── Per-pet colour palettes ──────────────────────────────────────────────────
const PAL = {
  cat: {
    fur: '#FFCB8E', earAccent: '#F4A0A8', outline: '#6B4C3B',
    white: '#FFFFFF', pupil: '#3D2010', nose: '#E8758A',
    blush: '#FFB3C6', mouthFill: '#C87090',
  },
  monkey: {
    fur: '#8B5030', earAccent: '#C07848', outline: '#3A1808',
    white: '#FFFFFF', pupil: '#1A0800', nose: '#3A1808',
    blush: '#D4A070', mouthFill: '#6B2C14',
    face: '#F5DEB3',   // beige face patch
  },
  dog: {
    fur: '#DEB887', earAccent: '#C49060', outline: '#5C3A1E',
    white: '#FFFFFF', pupil: '#2A1A08', nose: '#1A0A00',
    blush: '#FFB3C6', mouthFill: '#A06840',
  },
  fox: {
    fur: '#E0560A', earAccent: '#F5EDD8', outline: '#6A2808',
    white: '#F5F0E8', pupil: '#1A0800', nose: '#8A3010',
    blush: '#F0A888', mouthFill: '#B04020',
    face: '#F5EDD8',   // white muzzle patch
  },
  ghost: {
    fur: '#C8DCFF', earAccent: '#A8C4FF', outline: '#4060A8',
    white: '#FFFFFF', pupil: '#1A2860', nose: '#6080C0',
    blush: '#B0C4FF', mouthFill: '#6080C0',
  },
};

// ─── Palette-aware drawing helpers ────────────────────────────────────────────
const mkArc = (P) => (x1, y1, cx, cy, x2, y2, extra = {}) => (
  <path
    d={`M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`}
    stroke={P.outline} strokeWidth="2.6" fill="none" strokeLinecap="round"
    {...extra}
  />
);

const mkBrow = (P) => (x1, y1, cx, cy, x2, y2) => (
  <path
    d={`M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`}
    stroke={P.outline} strokeWidth="2.2" fill="none" strokeLinecap="round"
  />
);

const mkEye = (P) => ({ cx, cy, rx = 10, ry = 10, pR = 6 }) => (
  <>
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={P.white} stroke={P.outline} strokeWidth="1.5" />
    <circle  cx={cx + 1} cy={cy + 1} r={pR}        fill={P.pupil} />
    <circle  cx={cx + 3} cy={cy - 2} r={pR * 0.32} fill={P.white} />
  </>
);

// ─── Emotion faces (same eye/brow/mouth coords for every pet) ─────────────────
function makeFaces(P) {
  const arc  = mkArc(P);
  const brow = mkBrow(P);
  const Eye  = mkEye(P);

  return {
    happy: (<>
      {arc(65, 136, 78, 121, 91, 136)}
      {arc(109, 136, 122, 121, 135, 136)}
      {brow(64, 116, 78, 110, 91, 116)}
      {brow(109, 116, 122, 110, 136, 116)}
      {arc(77, 170, 100, 191, 123, 170)}
    </>),

    judging: (<>
      <Eye cx={78}  cy={133} />
      <Eye cx={122} cy={135} rx={10} ry={4.5} pR={3.5} />
      {brow(65, 118, 78, 114, 91, 118)}
      {brow(109, 108, 122, 104, 136, 111)}
      {arc(89, 172, 103, 179, 113, 169)}
    </>),

    shocked: (<>
      <Eye cx={78}  cy={130} rx={13} ry={13} pR={7.5} />
      <Eye cx={122} cy={130} rx={13} ry={13} pR={7.5} />
      {brow(62, 108, 78, 99, 93, 108)}
      {brow(107, 108, 122, 99, 138, 108)}
      <ellipse cx="100" cy="176" rx="11" ry="9"
        fill={P.mouthFill} stroke={P.outline} strokeWidth="1.8" />
    </>),

    proud: (<>
      <Eye cx={78}  cy={133} rx={10} ry={8} pR={5} />
      <Eye cx={122} cy={133} rx={10} ry={8} pR={5} />
      {brow(65, 117, 78, 114, 91, 118)}
      {brow(109, 112, 122, 108, 136, 114)}
      {arc(82, 170, 100, 187, 118, 170)}
    </>),

    bored: (<>
      <path d="M 68,133 A 10,10 0 0 0 88,133 Z"
        fill={P.white} stroke={P.outline} strokeWidth="1.5" />
      <ellipse cx="78"  cy="136" rx="5" ry="3" fill={P.pupil} />
      <path d="M 112,133 A 10,10 0 0 0 132,133 Z"
        fill={P.white} stroke={P.outline} strokeWidth="1.5" />
      <ellipse cx="122" cy="136" rx="5" ry="3" fill={P.pupil} />
      {brow(65, 125, 78, 119, 91, 120)}
      {brow(109, 120, 122, 119, 135, 125)}
      {arc(84, 175, 100, 166, 116, 175)}
    </>),

    sleeping: (<>
      {arc(66, 131, 78, 140, 90, 131)}
      {arc(110, 131, 122, 140, 134, 131)}
      {brow(66, 117, 78, 114, 90, 117)}
      {brow(110, 117, 122, 114, 134, 117)}
      {arc(91, 171, 100, 178, 109, 171)}
      <text x="148" y="110" fontSize="13" fontWeight="bold"
        fill={P.outline} opacity="0.65" fontFamily="sans-serif">z</text>
      <text x="159" y="96"  fontSize="15" fontWeight="bold"
        fill={P.outline} opacity="0.48" fontFamily="sans-serif">z</text>
      <text x="171" y="80"  fontSize="17" fontWeight="bold"
        fill={P.outline} opacity="0.32" fontFamily="sans-serif">z</text>
    </>),
  };
}

// ─── Per-pet base shapes ──────────────────────────────────────────────────────

function CatBase({ P }) {
  return (<>
    {/* Pointy ears */}
    <polygon points="38,108 62,46 90,108"   fill={P.fur}       stroke={P.outline} strokeWidth="2" strokeLinejoin="round" />
    <polygon points="110,108 138,46 162,108" fill={P.fur}      stroke={P.outline} strokeWidth="2" strokeLinejoin="round" />
    <polygon points="51,103 62,60 80,103"   fill={P.earAccent} />
    <polygon points="120,103 138,60 149,103" fill={P.earAccent} />
    {/* Head */}
    <circle cx="100" cy="148" r="70" fill={P.fur} stroke={P.outline} strokeWidth="2" />
    {/* Blush */}
    <ellipse cx="61"  cy="155" rx="13" ry="8" fill={P.blush} opacity="0.45" />
    <ellipse cx="139" cy="155" rx="13" ry="8" fill={P.blush} opacity="0.45" />
    {/* Nose */}
    <ellipse cx="100" cy="157" rx="5" ry="3.5" fill={P.nose} />
    {/* Whiskers */}
    <line x1="27"  y1="150" x2="72"  y2="155" stroke="#C4A882" strokeWidth="1.3" />
    <line x1="27"  y1="161" x2="72"  y2="162" stroke="#C4A882" strokeWidth="1.3" />
    <line x1="128" y1="155" x2="173" y2="150" stroke="#C4A882" strokeWidth="1.3" />
    <line x1="128" y1="162" x2="173" y2="161" stroke="#C4A882" strokeWidth="1.3" />
  </>);
}

function MonkeyBase({ P }) {
  return (<>
    {/* Round ears */}
    <circle cx="30"  cy="148" r="26" fill={P.fur}       stroke={P.outline} strokeWidth="2" />
    <circle cx="170" cy="148" r="26" fill={P.fur}       stroke={P.outline} strokeWidth="2" />
    <circle cx="30"  cy="148" r="16" fill={P.earAccent} />
    <circle cx="170" cy="148" r="16" fill={P.earAccent} />
    {/* Head */}
    <circle cx="100" cy="148" r="70" fill={P.fur} stroke={P.outline} strokeWidth="2" />
    {/* Beige face patch (below eye line) */}
    <ellipse cx="100" cy="170" rx="44" ry="32" fill={P.face} />
    {/* Blush */}
    <ellipse cx="63"  cy="154" rx="12" ry="8" fill={P.blush} opacity="0.5" />
    <ellipse cx="137" cy="154" rx="12" ry="8" fill={P.blush} opacity="0.5" />
    {/* Nostrils */}
    <circle cx="95"  cy="164" r="3.5" fill={P.nose} />
    <circle cx="105" cy="164" r="3.5" fill={P.nose} />
  </>);
}

function DogBase({ P }) {
  return (<>
    {/* Floppy hanging ears */}
    <rect x="20"  y="100" width="38" height="84" rx="19" fill={P.fur}       stroke={P.outline} strokeWidth="2" />
    <rect x="142" y="100" width="38" height="84" rx="19" fill={P.fur}       stroke={P.outline} strokeWidth="2" />
    <rect x="27"  y="108" width="24" height="64" rx="12" fill={P.earAccent} />
    <rect x="149" y="108" width="24" height="64" rx="12" fill={P.earAccent} />
    {/* Head */}
    <circle cx="100" cy="148" r="70" fill={P.fur} stroke={P.outline} strokeWidth="2" />
    {/* Blush */}
    <ellipse cx="61"  cy="155" rx="13" ry="8" fill={P.blush} opacity="0.45" />
    <ellipse cx="139" cy="155" rx="13" ry="8" fill={P.blush} opacity="0.45" />
    {/* Big dog nose */}
    <ellipse cx="100" cy="159" rx="11" ry="8" fill={P.nose} stroke={P.outline} strokeWidth="1" />
    <ellipse cx="97"  cy="156" rx="3"  ry="2" fill="#FFFFFF" opacity="0.3" />
  </>);
}

function FoxBase({ P }) {
  return (<>
    {/* Pointy fox ears — wider/shorter than cat */}
    <polygon points="44,112 64,46 88,112"   fill={P.fur}       stroke={P.outline} strokeWidth="2" strokeLinejoin="round" />
    <polygon points="112,112 136,46 156,112" fill={P.fur}      stroke={P.outline} strokeWidth="2" strokeLinejoin="round" />
    <polygon points="54,106 66,60 80,106"   fill={P.earAccent} />
    <polygon points="120,106 134,60 146,106" fill={P.earAccent} />
    {/* Head */}
    <circle cx="100" cy="148" r="70" fill={P.fur} stroke={P.outline} strokeWidth="2" />
    {/* White muzzle (below eye line) */}
    <ellipse cx="100" cy="168" rx="38" ry="28" fill={P.face} />
    {/* Blush */}
    <ellipse cx="63"  cy="148" rx="12" ry="8" fill={P.blush} opacity="0.4" />
    <ellipse cx="137" cy="148" rx="12" ry="8" fill={P.blush} opacity="0.4" />
    {/* Fox nose */}
    <ellipse cx="100" cy="157" rx="6" ry="4" fill={P.nose} stroke={P.outline} strokeWidth="1" />
  </>);
}

function GhostBase({ P }) {
  // Rounded top, three wavy bumps at the bottom
  const body = `
    M 32,178
    Q 32,78 100,78
    Q 168,78 168,178
    Q 154,164 140,180
    Q 126,196 112,180
    Q 98,164 84,180
    Q 70,196 56,180
    Q 44,164 32,178
    Z
  `;
  return (<>
    <path d={body} fill={P.fur} stroke={P.outline} strokeWidth="2" strokeLinejoin="round" />
    {/* Inner glow */}
    <ellipse cx="100" cy="128" rx="52" ry="38" fill="#FFFFFF" opacity="0.18" />
    {/* Blush */}
    <ellipse cx="65"  cy="148" rx="14" ry="9" fill={P.blush} opacity="0.4" />
    <ellipse cx="135" cy="148" rx="14" ry="9" fill={P.blush} opacity="0.4" />
    {/* Ghost nose — faint dot */}
    <circle cx="100" cy="157" r="3" fill={P.nose} opacity="0.55" />
  </>);
}

// ─── Per-pet blink overlays (erase eyes with fur colour, draw closed lids) ───
function makeBlinkOverlay(P) {
  const arc = mkArc(P);
  return (<>
    <rect x="62"  y="118" width="32" height="28" fill={P.fur} />
    <rect x="106" y="118" width="32" height="28" fill={P.fur} />
    {arc(66, 131, 78, 140, 90, 131)}
    {arc(110, 131, 122, 140, 134, 131)}
  </>);
}

// Ghost blink uses the ghost body colour
function makeGhostBlinkOverlay(P) {
  const arc = mkArc(P);
  return (<>
    <rect x="62"  y="118" width="32" height="28" fill={P.fur} />
    <rect x="106" y="118" width="32" height="28" fill={P.fur} />
    {arc(66, 131, 78, 140, 90, 131)}
    {arc(110, 131, 122, 140, 134, 131)}
  </>);
}

// ─── Pet registry ─────────────────────────────────────────────────────────────
const BASES = {
  cat:    CatBase,
  monkey: MonkeyBase,
  dog:    DogBase,
  fox:    FoxBase,
  ghost:  GhostBase,
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function PetFace({ emotion = 'happy', blinking = false, pet = 'cat' }) {
  const P     = PAL[pet]   ?? PAL.cat;
  const Base  = BASES[pet] ?? BASES.cat;
  const faces = makeFaces(P);

  // Cat / Monkey / Dog → Lottie body + SVG emotion overlay
  if (LOTTIE_MAP[pet]) {
    return (
      <div style={{ position: 'relative', width: 200, height: 250 }}>
        <Lottie
          animationData={LOTTIE_MAP[pet]}
          loop
          style={{ width: 200, height: 250 }}
        />
        {/* Emotion + blink drawn on top of the Lottie body */}
        <svg
          viewBox="0 0 200 250"
          width="200"
          height="250"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          {faces[emotion] ?? faces.happy}
          {blinking && emotion !== 'sleeping' && makeBlinkOverlay(P)}
        </svg>
      </div>
    );
  }

  // Fox / Ghost → pure SVG
  return (
    <svg viewBox="0 0 200 250" width="200" height="250" xmlns="http://www.w3.org/2000/svg">
      <Base P={P} />
      {faces[emotion] ?? faces.happy}
      {blinking && emotion !== 'sleeping' && makeBlinkOverlay(P)}
    </svg>
  );
}
