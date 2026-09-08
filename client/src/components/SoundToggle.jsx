import { useState } from 'react';
import { isMuted, setMuted, playClick } from '../lib/sound.js';

export function SoundToggle() {
  const [muted, setMutedState] = useState(isMuted());

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) playClick();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      className="fixed right-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-2xl backdrop-blur transition hover:bg-white/30 active:scale-90"
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
