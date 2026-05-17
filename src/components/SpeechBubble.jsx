import { useEffect, useState } from 'react';

export default function SpeechBubble({ text }) {
  const [displayText, setDisplayText] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!text) return;
    // Mount at opacity 0 first, then fade in after one paint frame
    setDisplayText(text);
    setVisible(false);
    const fadeIn  = setTimeout(() => setVisible(true),  50);
    const fadeOut = setTimeout(() => setVisible(false), 6050);
    return () => { clearTimeout(fadeIn); clearTimeout(fadeOut); };
  }, [text]);

  if (!displayText) return null;

  return (
    <div
      className="absolute top-2 left-2 right-2 z-10 pointer-events-none transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div className="bg-black/75 text-white text-xs text-center rounded-xl px-3 py-2 leading-snug shadow-lg">
        {displayText}
      </div>
    </div>
  );
}
