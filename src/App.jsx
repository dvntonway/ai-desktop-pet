import { useState, useEffect, useRef } from 'react';
import PetFace from './components/PetFace';
import SpeechBubble from './components/SpeechBubble';
import { onJudgement } from './api/judge';

export default function App() {
  const [emotion, setEmotion] = useState('happy');
  const [text, setText] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [blinking, setBlinking] = useState(false);
  const [activePet, setActivePet] = useState('cat');

  // Manual drag state — stored in refs so mousemove handler never goes stale
  const dragging   = useRef(false);
  const lastPos    = useRef({ x: 0, y: 0 });
  // Shut Up mode — ref so the quiet-tick handler always reads the latest value
  const shutUpRef  = useRef(false);

  // Load tier + active pet + shutUp on mount; listen for tray-menu switches
  useEffect(() => {
    window.electronAPI.getTier().then(({ activePet: pet, shutUp }) => {
      setActivePet(pet);
      shutUpRef.current = shutUp;
    });
    window.electronAPI.onPetChanged((pet) => setActivePet(pet));
    window.electronAPI.onShutUpChanged((on) => { shutUpRef.current = on; });
  }, []);

  // Shut Up mode: quiet ticks carry a pre-chosen random emotion, no speech bubble
  useEffect(() => {
    window.electronAPI.onQuietTick((emotion) => {
      setEmotion(emotion);
      setText(null);
    });
  }, []);

  // Low-reactions warning: show once as a speech bubble when 50 remain today
  useEffect(() => {
    window.electronAPI.onLowReactions((msg) => setText(msg));
  }, []);

  // Auto-update: show speech bubble once a new version has downloaded in the background
  useEffect(() => {
    window.electronAPI.onUpdateReady(() => {
      setText('I got smarter! Restart me to update 🐾');
    });
  }, []);

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

  // Attach move/up listeners on the document so dragging works even if the
  // cursor briefly leaves the window during fast movement.
  useEffect(() => {
    function onMouseMove(e) {
      if (!dragging.current) return;
      const dx = e.screenX - lastPos.current.x;
      const dy = e.screenY - lastPos.current.y;
      lastPos.current = { x: e.screenX, y: e.screenY };
      if (dx !== 0 || dy !== 0) window.electronAPI.moveWindowBy(dx, dy);
    }
    function onMouseUp() { dragging.current = false; }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };
  }, []);

  function handleMouseDown(e) {
    if (e.button !== 0) return; // left-button drag only
    dragging.current  = true;
    lastPos.current   = { x: e.screenX, y: e.screenY };
  }

  function handleContextMenu(e) {
    e.preventDefault();
    window.electronAPI.showContextMenu();
  }

  return (
    <div
      className="relative w-full h-full select-none transition-opacity duration-700"
      style={{ opacity: hidden ? 0 : 1 }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    >
      <SpeechBubble text={text} />
      <PetFace emotion={emotion} blinking={blinking} pet={activePet} />
    </div>
  );
}
