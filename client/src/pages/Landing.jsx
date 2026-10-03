import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../state/AppContext.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';
import { playClick } from '../lib/sound.js';
import { useIsMobile } from '../lib/useIsMobile.js';

const TAGLINES = [
  'Spin the wheel and discover your destiny. 😈',
  "Don't worry, it's a legally binding decision.",
  "No refunds, no exchanges, no crying (much).",
  "Your bank account is about to make a face.",
  "This is not a scam. It's worse — it's a birthday.",
  "Plot twist: you already agreed to this by opening the link.",
  "Fun fact: the wheel is rigged. Against your wallet.",
  "Free will was fun while it lasted.",
  "Somewhere, an accountant just felt a disturbance.",
  "There is no escape. Only spinning.",
];

const EMPTY_NAME_ERRORS = [
  'Come on, everyone has a name 😏',
  "Nice try. Anonymous donors still gotta spin.",
  "I need a name to blame this on later.",
  "The wheel refuses to spin for a ghost.",
  "Even witness protection fills out this field.",
  "Type something. Anything. I'm not picky, I'm desperate.",
];

export default function Landing() {
  const { name, setName, resetSpinFlow } = useAppContext();
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const tagline = useMemo(() => TAGLINES[Math.floor(Math.random() * TAGLINES.length)], []);

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(EMPTY_NAME_ERRORS[Math.floor(Math.random() * EMPTY_NAME_ERRORS.length)]);
      return;
    }
    if (trimmed.length > 50) {
      setError("That's not a name, that's a novel 📖 Give me the short version.");
      return;
    }
    setError('');
    setName(trimmed);
    resetSpinFlow();
    playClick();
    navigate('/price-range');
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12 text-center text-white">
      <FloatingBirthdayBits count={isMobile ? 16 : 32} />
      <motion.h1
        initial={{ opacity: 0, y: -30, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
        className="font-display text-4xl font-extrabold drop-shadow-lg sm:text-5xl"
      >
        🎂 WELCOME TO MY BIRTHDAY 🎂
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="mt-4 max-w-md text-lg font-semibold text-white/90 sm:text-xl"
      >
        Congratulations! You have been selected to buy me a gift.
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42, duration: 0.5 }}
        className="mt-2 max-w-sm text-base font-semibold italic text-white/70"
      >
        {tagline}
      </motion.p>

      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.5 }}
        className="mt-10 flex w-full max-w-sm flex-col items-center gap-3"
      >
        <label htmlFor="name" className="text-lg font-bold">
          What's your name, generous soul?
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name (for the receipts)..."
          maxLength={50}
          className="w-full rounded-2xl border-4 border-white/40 bg-white/10 px-4 py-3 text-center text-base font-semibold text-white placeholder-white/60 outline-none backdrop-blur focus:border-white sm:px-5 sm:text-xl"
        />
        {error && (
          <p role="alert" className="font-semibold text-yellow-200">
            {error}
          </p>
        )}
        <motion.button
          type="submit"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          className="mt-2 rounded-full bg-party-yellow px-10 py-4 text-xl font-extrabold text-purple-900 shadow-lg shadow-black/20 transition"
        >
          LET'S GO! 🎉
        </motion.button>
      </motion.form>
    </div>
  );
}
