import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../state/AppContext.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';

export default function LoveQuestion() {
  const { name, setSpinsAllowed, setRetriesRemaining } = useAppContext();
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!name) navigate('/');
  }, [name, navigate]);

  if (!name) return null;

  function handleAnswer(saysYes) {
    setSpinsAllowed(saysYes ? 2 : 1);
    setRetriesRemaining(2);
    if (saysYes) {
      setConfirmed(true);
      window.setTimeout(() => navigate('/wheel'), 1400);
    } else {
      navigate('/wheel');
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-6 py-12 text-center text-white">
      <FloatingBirthdayBits count={8} />
      <AnimatePresence mode="wait">
        {!confirmed ? (
          <motion.div
            key="question"
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex flex-col items-center gap-8"
          >
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-display text-3xl font-extrabold drop-shadow-lg sm:text-4xl"
            >
              If you love me... will you get me 2 gifts? 🥺🎁🎁
            </motion.h1>
            <div className="flex w-full max-w-sm flex-col gap-4 sm:flex-row">
              <motion.button
                type="button"
                onClick={() => handleAnswer(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                className="flex-1 rounded-full bg-party-yellow px-8 py-5 text-xl font-extrabold text-purple-900 shadow-lg shadow-black/20"
              >
                Yes, obviously 🥹
              </motion.button>
              <motion.button
                type="button"
                onClick={() => handleAnswer(false)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
                className="flex-1 rounded-full bg-white/20 px-8 py-5 text-xl font-extrabold text-white shadow-lg shadow-black/20"
              >
                Just the one 😬
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.p
            key="confirmed"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="font-display text-2xl font-extrabold drop-shadow-lg"
          >
            🎉 2 spin chances unlocked! Make 'em cheap ones 😏
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
