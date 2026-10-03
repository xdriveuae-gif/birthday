import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppContext } from '../state/AppContext.jsx';
import { Wheel } from '../components/Wheel/Wheel.jsx';
import { getTargetRotation, SPIN_ANIMATION_SECONDS } from '../components/Wheel/wheelMath.js';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';
import { getJson, postJson, ApiError } from '../lib/api.js';
import { playWhirStart, playTick, playCelebration } from '../lib/sound.js';

const FLAVOR_LINES = [
  'Your wallet is about to get lighter 💸',
  "Let's see how expensive your friendship really is.",
  "May the odds be ever in my favor 😈",
  "Good luck... you're gonna need it 😂",
  "Somewhere in this wheel is your financial doom.",
  "Destiny has a spending limit, apparently.",
];

const LOADING_LINES = [
  'Loading the wheel of destiny...',
  'Summoning the wheel gods...',
  'Calculating your financial future...',
  'Warming up the wheel of misfortune...',
];

const SPINNING_LABELS = [
  'SPINNING...',
  'CALCULATING REGRET...',
  'CONSULTING THE UNIVERSE...',
  'ROLLING THE DICE OF DESTINY...',
  'DECIDING YOUR FATE...',
];

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export default function WheelPage() {
  const { name, setResult, spinsAllowed, spinsCompleted, sessionId, priceRange } = useAppContext();
  const navigate = useNavigate();
  const [segments, setSegments] = useState([]);
  const [wheelEnabled, setWheelEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState('');
  const [spinningLabel, setSpinningLabel] = useState('SPINNING...');
  const tickTimerRef = useRef(null);
  const spinTimeoutRef = useRef(null);
  const flavorLine = useMemo(() => pickRandom(FLAVOR_LINES), []);
  const loadingLine = useMemo(() => pickRandom(LOADING_LINES), []);

  useEffect(() => {
    if (!name) {
      navigate('/');
      return;
    }
    async function loadIdleState() {
      try {
        const giftsParams = new URLSearchParams({ name, sessionId });
        if (priceRange) giftsParams.set('priceRange', priceRange);
        const [giftsRes, settingsRes] = await Promise.all([
          getJson(`/api/gifts/public?${giftsParams.toString()}`),
          getJson('/api/settings/public'),
        ]);
        setSegments(giftsRes.gifts);
        setWheelEnabled(settingsRes.wheelEnabled);
      } catch {
        setError('Could not load the wheel. Please refresh and try again.');
      } finally {
        setLoading(false);
      }
    }
    loadIdleState();
  }, [name, navigate, sessionId, priceRange]);

  useEffect(
    () => () => {
      clearInterval(tickTimerRef.current);
      clearTimeout(spinTimeoutRef.current);
    },
    []
  );

  async function handleSpin() {
    if (spinning) return;
    setError('');
    setSpinning(true);
    setSpinningLabel(pickRandom(SPINNING_LABELS));
    try {
      const response = await postJson('/api/spin', { name, sessionId, priceRange });
      const finalSegments = response.wheelSegments;
      setSegments(finalSegments);
      const winningIndex = finalSegments.findIndex((g) => g.id === response.gift.id);
      const nextRotation = getTargetRotation({
        segmentIndex: winningIndex,
        totalSegments: finalSegments.length,
        previousRotation: rotation,
      });

      playWhirStart();
      let ticks = 0;
      tickTimerRef.current = setInterval(() => {
        ticks += 1;
        playTick();
        if (ticks > 24) clearInterval(tickTimerRef.current);
      }, 180);

      setRotation(nextRotation);
      spinTimeoutRef.current = window.setTimeout(() => {
        clearInterval(tickTimerRef.current);
        playCelebration();
        setResult({ gift: response.gift });
        navigate('/result');
      }, SPIN_ANIMATION_SECONDS * 1000 + 200);
    } catch (err) {
      setSpinning(false);
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-6 py-12 text-center text-white">
      <FloatingBirthdayBits count={8} />
      <h2 className="font-display text-3xl font-extrabold drop-shadow sm:text-4xl">{flavorLine}</h2>

      {spinsAllowed > 1 && (
        <p className="text-sm font-bold text-white/70">
          🎁 Gift {spinsCompleted + 1} of {spinsAllowed}
        </p>
      )}

      {loading && <p className="text-lg font-semibold">{loadingLine}</p>}

      {!loading && segments.length === 0 && (
        <p className="max-w-sm text-lg font-semibold text-yellow-200">
          No gifts are configured yet — the birthday human forgot their homework. Go bug them! 😅
        </p>
      )}

      {!loading && segments.length > 0 && <Wheel segments={segments} rotation={rotation} spinning={spinning} />}

      {error && (
        <p role="alert" className="max-w-sm font-semibold text-yellow-200">
          {error}
        </p>
      )}

      {!loading && segments.length > 0 && (
        <motion.button
          type="button"
          onClick={handleSpin}
          disabled={spinning || !wheelEnabled}
          whileHover={{ scale: spinning ? 1 : 1.05 }}
          whileTap={{ scale: spinning ? 1 : 0.92 }}
          className="rounded-full bg-party-yellow px-12 py-5 text-2xl font-extrabold text-purple-900 shadow-lg shadow-black/20 transition disabled:opacity-50"
        >
          {spinning ? spinningLabel : wheelEnabled ? 'SPIN THE WHEEL 🎰' : 'The wheel is taking a nap 😴'}
        </motion.button>
      )}
    </div>
  );
}
