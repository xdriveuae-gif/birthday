import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppContext } from '../state/AppContext.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { getJson, postJson, ApiError } from '../lib/api.js';

const CASH_LINES = [
  'Straight to the point. I respect that.',
  'No wheel, no drama, just cold hard cash.',
  'The wheel weeps, but your bank account rejoices.',
  'Efficient. Ruthless. Iconic.',
];

export default function Cash() {
  const { name, setName, resetSpinFlow, setResult } = useAppContext();
  const navigate = useNavigate();
  const [cliqAlias, setCliqAlias] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const line = useMemo(() => CASH_LINES[Math.floor(Math.random() * CASH_LINES.length)], []);

  useEffect(() => {
    if (!name) {
      navigate('/');
      return;
    }
    getJson('/api/settings/public')
      .then((res) => setCliqAlias(res.cliqAlias))
      .catch(() => setError('Could not load the payment details. Please refresh and try again.'))
      .finally(() => setLoading(false));
  }, [name, navigate]);

  if (!name) return null;

  const message = [
    '💰 Birthday Cash Assignment 💰',
    '',
    'I looked at the wheel and chose cash like a responsible adult.',
    '',
    `Cliq: ${cliqAlias}`,
  ].join('\n');
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function handleConfirmSubmit() {
    setConfirming(false);
    setError('');
    try {
      await postJson('/api/participants', { name, outcome: 'cash' });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  function handleBackToStart() {
    setName('');
    setResult(null);
    resetSpinFlow();
    navigate('/');
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden px-6 py-12 text-center text-white">
      <FloatingBirthdayBits count={6} />
      <motion.h1
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="font-display text-4xl font-extrabold drop-shadow-lg sm:text-5xl"
      >
        💰 CASH IT IS 💰
      </motion.h1>

      {loading && <p className="text-lg font-semibold">Loading payment details...</p>}

      {!loading && cliqAlias && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full max-w-xs rounded-3xl bg-white/15 p-6 shadow-2xl backdrop-blur"
        >
          <p className="font-semibold text-white/80">{line}</p>
          <p className="mt-4 font-display text-2xl font-extrabold">Cliq: {cliqAlias}</p>
        </motion.div>
      )}

      {error && (
        <p role="alert" className="max-w-sm font-semibold text-yellow-200">
          {error}
        </p>
      )}

      {!loading && cliqAlias && !submitted && (
        <div className="flex flex-col items-center gap-3">
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
          <motion.button
            type="button"
            onClick={() => setConfirming(true)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            className="rounded-full bg-party-yellow px-10 py-4 text-xl font-extrabold text-purple-900 shadow-lg shadow-black/20"
          >
            Submit
          </motion.button>
        </div>
      )}

      {submitted && (
        <>
          <p className="font-display text-xl font-extrabold text-green-200">✅ Locked in!</p>
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
        </>
      )}

      <button type="button" onClick={handleBackToStart} className="text-sm font-semibold text-white/70 underline">
        Back to start
      </button>

      <ConfirmDialog
        open={confirming}
        title="You sure about this?"
        description="Hitting submit means cash it is 😏 No take-backs."
        confirmLabel="Yep, cash it is"
        onConfirm={handleConfirmSubmit}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
