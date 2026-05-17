import { useState, useEffect } from 'react';
import PetFace from './components/PetFace';
import SpeechBubble from './components/SpeechBubble';
import { onJudgement } from './api/judge';

export default function App() {
  const [emotion, setEmotion] = useState('happy');
  const [text, setText] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    return onJudgement((json) => {
      if (json.incognito) {
        setHidden(true);
      } else {
        setHidden(false);
        setEmotion(json.emotion ?? 'happy');
        setText(json.text ?? null);
      }
    });
  }, []);

  // Random blink every 3–7 seconds
  useEffect(() => {
    let outer, inner;
    function scheduleBlink() {
      outer = setTimeout(() => {
        setBlinking(true);
        inner = setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 150);
      }, 3000 + Math.random() * 4000);
    }
    scheduleBlink();
    return () => { clearTimeout(outer); clearTimeout(inner); };
  }, []);

  return (
    <div
      className="relative w-full h-full select-none transition-opacity duration-700"
      style={{ opacity: hidden ? 0 : 1, WebkitAppRegion: 'drag' }}
    >
      <SpeechBubble text={text} />
      <PetFace emotion={emotion} blinking={blinking} />
    </div>
  );
}
