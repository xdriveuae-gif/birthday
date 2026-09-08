import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../state/AppContext.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';

export default function Choice() {
  const { name } = useAppContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (!name) navigate('/');
  }, [name, navigate]);

  if (!name) return null;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-6 py-12 text-center text-white">
      <FloatingBirthdayBits count={8} />
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-3xl font-extrabold drop-shadow-lg sm:text-4xl"
      >
        Cash or gift, {name}? 💰🎁
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="max-w-sm text-lg font-semibold text-white/80"
      >
        Choose wisely. There is no wrong answer. (There is a wrong answer.)
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="flex w-full max-w-sm flex-col gap-4 sm:flex-row"
      >
        <motion.button
          type="button"
          onClick={() => navigate('/cash')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          className="flex-1 rounded-full bg-party-teal px-8 py-5 text-xl font-extrabold text-purple-900 shadow-lg shadow-black/20"
        >
          💰 CASH ME OUT
        </motion.button>
        <motion.button
          type="button"
          onClick={() => navigate('/love-question')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          className="flex-1 rounded-full bg-party-yellow px-8 py-5 text-xl font-extrabold text-purple-900 shadow-lg shadow-black/20"
        >
          🎁 SPIN FOR A GIFT
        </motion.button>
      </motion.div>
    </div>
  );
}
