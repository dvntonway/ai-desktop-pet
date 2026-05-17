export const EMOTIONS = ['happy', 'judging', 'shocked', 'proud', 'bored', 'sleeping'];

const P = {
  fur:     '#FFCB8E',
  earPink: '#F4A0A8',
  outline: '#6B4C3B',
  white:   '#FFFFFF',
  pupil:   '#3D2010',
  nose:    '#E8758A',
  blush:   '#FFB3C6',
  whisker: '#C4A882',
  mouthFill: '#C87090',
};

// Quadratic bezier arc (used for eyes, brows, mouth)
const arc = (x1, y1, cx, cy, x2, y2, extra = {}) => (
  <path
    d={`M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`}
    stroke={P.outline}
    strokeWidth="2.6"
    fill="none"
    strokeLinecap="round"
    {...extra}
  />
);

function Brow({ x1, y1, cx, cy, x2, y2 }) {
  return (
    <path
      d={`M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`}
      stroke={P.outline}
      strokeWidth="2.2"
      fill="none"
      strokeLinecap="round"
    />
  );
}

// Open eye: ellipse white + pupil circle + highlight dot
function Eye({ cx, cy, rx = 10, ry = 10, pR = 6 }) {
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={P.white} stroke={P.outline} strokeWidth="1.5" />
      <circle  cx={cx + 1} cy={cy + 1} r={pR}          fill={P.pupil} />
      <circle  cx={cx + 3} cy={cy - 2} r={pR * 0.32}   fill={P.white} />
    </>
  );
}

// Static parts shared across all emotions
function Base() {
  return (
    <>
      {/* Outer ears (drawn first so head sits on top) */}
      <polygon points="38,108 62,46 90,108"  fill={P.fur} stroke={P.outline} strokeWidth="2" strokeLinejoin="round" />
      <polygon points="110,108 138,46 162,108" fill={P.fur} stroke={P.outline} strokeWidth="2" strokeLinejoin="round" />
      {/* Inner ear pink */}
      <polygon points="51,103 62,60 80,103"  fill={P.earPink} />
      <polygon points="120,103 138,60 149,103" fill={P.earPink} />

      {/* Head */}
      <circle cx="100" cy="148" r="70" fill={P.fur} stroke={P.outline} strokeWidth="2" />

      {/* Blush */}
      <ellipse cx="61"  cy="155" rx="13" ry="8" fill={P.blush} opacity="0.45" />
      <ellipse cx="139" cy="155" rx="13" ry="8" fill={P.blush} opacity="0.45" />

      {/* Nose */}
      <ellipse cx="100" cy="157" rx="5" ry="3.5" fill={P.nose} />

      {/* Whiskers */}
      <line x1="27" y1="150" x2="72" y2="155" stroke={P.whisker} strokeWidth="1.3" />
      <line x1="27" y1="161" x2="72" y2="162" stroke={P.whisker} strokeWidth="1.3" />
      <line x1="128" y1="155" x2="173" y2="150" stroke={P.whisker} strokeWidth="1.3" />
      <line x1="128" y1="162" x2="173" y2="161" stroke={P.whisker} strokeWidth="1.3" />
    </>
  );
}

// ─── Emotion face data ────────────────────────────────────────────────────────

const faces = {
  // Eyes: upward squinting arcs (pure joy). Wide smile.
  happy: (
    <>
      {arc(65, 136, 78, 121, 91, 136)}
      {arc(109, 136, 122, 121, 135, 136)}
      <Brow x1={64}  y1={116} cx={78}  cy={110} x2={91}  y2={116} />
      <Brow x1={109} y1={116} cx={122} cy={110} x2={136} y2={116} />
      {arc(77, 170, 100, 191, 123, 170)}
    </>
  ),

  // Left eye normal, right eye heavily squinted. One brow way up. Flat smirk.
  judging: (
    <>
      <Eye cx={78} cy={133} />
      <Eye cx={122} cy={135} rx={10} ry={4.5} pR={3.5} />
      <Brow x1={65}  y1={118} cx={78}  cy={114} x2={91}  y2={118} />
      <Brow x1={109} y1={108} cx={122} cy={104} x2={136} y2={111} />
      {arc(89, 172, 103, 179, 113, 169)}
    </>
  ),

  // Large wide-open eyes. Brows raised high. Open oval mouth.
  shocked: (
    <>
      <Eye cx={78}  cy={130} rx={13} ry={13} pR={7.5} />
      <Eye cx={122} cy={130} rx={13} ry={13} pR={7.5} />
      <Brow x1={62}  y1={108} cx={78}  cy={99}  x2={93}  y2={108} />
      <Brow x1={107} y1={108} cx={122} cy={99}  x2={138} y2={108} />
      <ellipse cx="100" cy="176" rx="11" ry="9"
        fill={P.mouthFill} stroke={P.outline} strokeWidth="1.8" />
    </>
  ),

  // Slightly oval confident eyes. Asymmetric brows. Broad satisfied smile.
  proud: (
    <>
      <Eye cx={78}  cy={133} rx={10} ry={8} pR={5} />
      <Eye cx={122} cy={133} rx={10} ry={8} pR={5} />
      <Brow x1={65}  y1={117} cx={78}  cy={114} x2={91}  y2={118} />
      <Brow x1={109} y1={112} cx={122} cy={108} x2={136} y2={114} />
      {arc(82, 170, 100, 187, 118, 170)}
    </>
  ),

  // Half-lidded eyes (bottom semicircle only). Drooping brows. Slight frown.
  bored: (
    <>
      <path d="M 68,133 A 10,10 0 0 0 88,133 Z"
        fill={P.white} stroke={P.outline} strokeWidth="1.5" />
      <ellipse cx="78" cy="136" rx="5" ry="3" fill={P.pupil} />
      <path d="M 112,133 A 10,10 0 0 0 132,133 Z"
        fill={P.white} stroke={P.outline} strokeWidth="1.5" />
      <ellipse cx="122" cy="136" rx="5" ry="3" fill={P.pupil} />
      {/* Brows: outer corners droop (tired) */}
      <Brow x1={65}  y1={125} cx={78}  cy={119} x2={91}  y2={120} />
      <Brow x1={109} y1={120} cx={122} cy={119} x2={135} y2={125} />
      {arc(84, 175, 100, 166, 116, 175)}
    </>
  ),

  // Closed downward arcs for eyes. Relaxed brows. Peaceful smile. Z's.
  sleeping: (
    <>
      {arc(66, 131, 78, 140, 90, 131)}
      {arc(110, 131, 122, 140, 134, 131)}
      <Brow x1={66}  y1={117} cx={78}  cy={114} x2={90}  y2={117} />
      <Brow x1={110} y1={117} cx={122} cy={114} x2={134} y2={117} />
      {arc(91, 171, 100, 178, 109, 171)}
      <text x="148" y="110" fontSize="13" fontWeight="bold"
        fill={P.outline} opacity="0.65" fontFamily="sans-serif">z</text>
      <text x="159" y="96"  fontSize="15" fontWeight="bold"
        fill={P.outline} opacity="0.48" fontFamily="sans-serif">z</text>
      <text x="171" y="80"  fontSize="17" fontWeight="bold"
        fill={P.outline} opacity="0.32" fontFamily="sans-serif">z</text>
    </>
  ),
};

// Fur-colored rects erase the current eye shape; arcs draw the closed lid on top.
// Sleeping already has closed eyes, so blinking is skipped for that emotion.
function BlinkOverlay() {
  return (
    <>
      <rect x="62" y="118" width="32" height="28" fill={P.fur} />
      <rect x="106" y="118" width="32" height="28" fill={P.fur} />
      {arc(66, 131, 78, 140, 90, 131)}
      {arc(110, 131, 122, 140, 134, 131)}
    </>
  );
}

export default function PetFace({ emotion = 'happy', blinking = false }) {
  return (
    <svg viewBox="0 0 200 250" width="200" height="250" xmlns="http://www.w3.org/2000/svg">
      <Base />
      {faces[emotion] ?? faces.happy}
      {blinking && emotion !== 'sleeping' && <BlinkOverlay />}
    </svg>
  );
}
