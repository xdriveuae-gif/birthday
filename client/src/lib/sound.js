const SILENT_WAV = 'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==';

let audioCtx = null;
let iosSessionUnlocked = false;
let muted = (() => {
  try {
    return localStorage.getItem('bday-muted') === 'true';
  } catch {
    return false;
  }
})();

// iOS Safari mutes Web Audio API sounds when the phone's silent switch is
// on, unless an <audio>/<video> element has played first (which puts the
// page's audio session into the "playback" category instead of "ambient").
// Playing a near-silent clip on the very first tap works around this.
function unlockIOSAudioSession() {
  if (iosSessionUnlocked) return;
  iosSessionUnlocked = true;
  try {
    const audio = new Audio(SILENT_WAV);
    audio.play().catch(() => {});
  } catch {
    // ignore — best-effort unlock only
  }
}

function getContext() {
  unlockIOSAudioSession();
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone({ frequency, duration, type = 'sine', gain = 0.15, delay = 0 }) {
  if (muted) return;
  const ctx = getContext();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  const startTime = ctx.currentTime + delay;
  gainNode.gain.setValueAtTime(gain, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gainNode).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem('bday-muted', String(value));
  } catch {
    // ignore storage failures (private browsing, etc.)
  }
}

export function playClick() {
  playTone({ frequency: 660, duration: 0.08, type: 'square', gain: 0.12 });
}

export function playTick() {
  playTone({ frequency: 900, duration: 0.03, type: 'square', gain: 0.08 });
}

export function playWhirStart() {
  if (muted) return;
  const ctx = getContext();
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 4);
  gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 4);
  osc.connect(gainNode).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 4);
}

export function playCelebration() {
  if (muted) return;
  [523.25, 659.25, 783.99].forEach((frequency, i) => {
    playTone({ frequency, duration: 0.3, type: 'triangle', gain: 0.15, delay: i * 0.12 });
  });
}
