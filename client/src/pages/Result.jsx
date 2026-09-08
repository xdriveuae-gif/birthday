import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppContext } from '../state/AppContext.jsx';
import { Confetti } from '../components/Confetti.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';

const JOKES = [
  'Sorry. No take-backs.',
  "Yep... that's what you're buying me 😂",
  'The wheel has spoken. Democracy was never an option.',
  'May the odds be ever in my favor 😈',
  "Congratulations, your wallet has been selected.",
  "This message will self-destruct... into your bank statement.",
  "I did not rig this. Probably.",
  "Fate has excellent taste, don't you think?",
  "Go forth and shop. The wheel commands it.",
];

const BACK_TO_START_LABELS = [
  'Back to start',
  'Spin someone else in',
  'Send another victim',
];

export default function Result() {
  const { name, result, setName, setResult } = useAppContext();
  const navigate = useNavigate();
  const joke = useMemo(() => JOKES[Math.floor(Math.random() * JOKES.length)], []);
  const backLabel = useMemo(
    () => BACK_TO_START_LABELS[Math.floor(Math.random() * BACK_TO_START_LABELS.length)],
    []
  );

  useEffect(() => {
    if (!result) navigate('/');
  }, [result, navigate]);

  if (!result) return null;

  const { gift } = result;
  const message = [
    '🎁 OFFICIAL Birthday Gift Assignment 🎁',
    '',
    "I spun a wheel (a real, physical decision-making device) and it has ruled, with zero appeals process, that I'm getting you:",
    '',
    `🎁 ${gift.name}`,
    '',
    'The wheel has spoken. I am but a humble servant of its will 😂',
    '',
    'Get it here (this link is basically a court order now):',
    gift.productUrl,
  ].join('\n');
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  function handleBackToStart() {
    setName('');
    setResult(null);
    navigate('/');
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden px-6 py-12 text-center text-white">
      <Confetti />
      <FloatingBirthdayBits count={6} />

      <motion.h1
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 12 }}
        className="font-display text-4xl font-extrabold drop-shadow-lg sm:text-5xl"
      >
        🎉 THE WHEEL HAS SPOKEN 🎉
      </motion.h1>

      <p className="text-lg font-semibold text-white/90">Hey {name},</p>
      <p className="text-lg font-semibold text-white/90">Your gift is:</p>

      <motion.div
        initial={{ y: 40, opacity: 0, rotate: -6 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 180 }}
        className="w-full max-w-xs rounded-3xl bg-white/15 p-6 shadow-2xl backdrop-blur"
      >
        {gift.imageUrl && (
          <img src={gift.imageUrl} alt={gift.name} className="mx-auto mb-4 h-40 w-40 rounded-2xl object-cover shadow-lg" />
        )}
        <p className="font-display text-2xl font-extrabold">{gift.name}</p>
        <p className="mt-2 text-sm font-semibold text-white/80">{joke}</p>
      </motion.div>

      <motion.a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        className="rounded-full bg-[#25D366] px-10 py-4 text-xl font-extrabold text-white shadow-lg shadow-black/20"
      >
        📱 SEND TO MY WHATSAPP
      </motion.a>

      <button type="button" onClick={handleBackToStart} className="text-sm font-semibold text-white/70 underline">
        {backLabel}
      </button>
    </div>
  );
}
