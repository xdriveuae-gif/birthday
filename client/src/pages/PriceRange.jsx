import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../state/AppContext.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';

const OPTIONS = [
  { value: '10-25', label: '10 – 25', emoji: '💵' },
  { value: '25-50', label: '25 – 50', emoji: '💰' },
  { value: '50-100', label: '50 – 100', emoji: '💎' },
];

export default function PriceRange() {
  const { name, setPriceRange } = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!name) navigate('/');
  }, [name, navigate]);

  if (!name) return null;

  function handleSelect(value) {
    setPriceRange(value);
    navigate('/wheel');
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-6 py-12 text-center text-white">
      <FloatingBirthdayBits count={8} />
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-3xl font-extrabold drop-shadow-lg sm:text-4xl"
      >
        What's your budget, {name}? 🎯
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="max-w-sm text-lg font-semibold text-white/80"
      >
        Pick a range and the wheel will only land on gifts you can actually afford. How considerate.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex w-full max-w-sm flex-col gap-4"
      >
        {OPTIONS.map((opt) => (
          <motion.button
            key={opt.value}
            type="button"
            onClick={() => handleSelect(opt.value)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            className="rounded-full bg-party-yellow px-8 py-5 text-xl font-extrabold text-purple-900 shadow-lg shadow-black/20"
          >
            {opt.emoji} {opt.label}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
