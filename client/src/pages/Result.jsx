import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppContext } from '../state/AppContext.jsx';
import { Confetti } from '../components/Confetti.jsx';
import { FloatingBirthdayBits } from '../components/FloatingBirthdayBits.jsx';
import { ConfirmDialog } from '../components/ConfirmDialog.jsx';
import { getJson, postJson, ApiError } from '../lib/api.js';

const JOKES = [
  'Sorry. No take-backs.',
  "Yep... that's what you're buying me 😂",
  'The wheel has spoken. Democracy was never an option.',
  'May the odds be ever in my favor 😈',
  'Congratulations, your wallet has been selected.',
  'This message will self-destruct... into your bank statement.',
  'I did not rig this. Probably.',
  "Fate has excellent taste, don't you think?",
  'Go forth and shop. The wheel commands it.',
];

const CASH_LINES = [
  'Straight to the point. I respect that.',
  'No wheel drama needed — cold hard cash it is.',
  'The wheel weeps, but your bank account rejoices.',
  'Efficient. Ruthless. Iconic.',
];

const BACK_TO_START_LABELS = ['Back to start', 'Spin someone else in', 'Send another victim'];

export default function Result() {
  const {
    name,
    result,
    setName,
    setResult,
    spinsAllowed,
    spinsCompleted,
    setSpinsCompleted,
    retriesRemaining,
    setRetriesRemaining,
    sessionId,
    resetSpinFlow,
    setPriceRange,
  } = useAppContext();
  const navigate = useNavigate();
  const joke = useMemo(() => JOKES[Math.floor(Math.random() * JOKES.length)], []);
  const cashLine = useMemo(() => CASH_LINES[Math.floor(Math.random() * CASH_LINES.length)], []);
  const backLabel = useMemo(
    () => BACK_TO_START_LABELS[Math.floor(Math.random() * BACK_TO_START_LABELS.length)],
    []
  );
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [cliqAlias, setCliqAlias] = useState('');

  useEffect(() => {
    if (!result) navigate('/');
  }, [result, navigate]);

  const isCash = result?.gift?.id === 'cash';

  useEffect(() => {
    if (!isCash) return;
    getJson('/api/settings/public')
      .then((res) => setCliqAlias(res.cliqAlias))
      .catch(() => setError('Could not load the payment details. Please refresh and try again.'));
  }, [isCash]);

  if (!result) return null;

  const { gift } = result;
  const message = isCash
    ? ['💰 Birthday Cash Assignment 💰', '', 'The wheel landed on CASH. Adult decisions win again.', '', `Cliq: ${cliqAlias}`].join('\n')
    : [
        '🎁 Birthday Gift Assignment 🎁',
        '',
        "I spun the wheel and apparently I'm responsible for getting you:",
        '',
        `🎁 ${gift.name}`,
        ...(gift.price ? [`💵 ${gift.price}`] : []),
        '',
        'Apparently the wheel has spoken 😂',
        '',
        'Get it here:',
        gift.productUrl,
      ].join('\n');
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  async function handleConfirmSubmit() {
    setConfirming(false);
    setSubmitting(true);
    setError('');
    try {
      if (isCash) {
        await postJson('/api/participants', { name, outcome: 'cash', sessionId });
      } else {
        await postJson('/api/participants', { name, outcome: 'gift', giftId: gift.id, sessionId });
      }
      const nextCompleted = spinsCompleted + 1;
      setSpinsCompleted(nextCompleted);
      if (nextCompleted < spinsAllowed) {
        setRetriesRemaining(2);
        setResult(null);
        setPriceRange(null);
        navigate('/price-range');
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetry() {
    setRetriesRemaining((r) => r - 1);
    setResult(null);
    navigate('/wheel');
  }

  function handleBackToStart() {
    setName('');
    setResult(null);
    resetSpinFlow();
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
      <p className="text-lg font-semibold text-white/90">{isCash ? 'The wheel says:' : 'Your gift is:'}</p>

      <motion.div
        initial={{ y: 40, opacity: 0, rotate: -6 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 180 }}
        className="w-full max-w-xs rounded-3xl bg-white/15 p-6 shadow-2xl backdrop-blur"
      >
        {isCash ? (
          <>
            <p className="font-display text-2xl font-extrabold">💰 CASH</p>
            <p className="mt-2 text-sm font-semibold text-white/80">{cashLine}</p>
            {cliqAlias && <p className="mt-4 font-display text-xl font-extrabold">Cliq: {cliqAlias}</p>}
          </>
        ) : (
          <>
            {gift.imageUrl && (
              <img src={gift.imageUrl} alt={gift.name} className="mx-auto mb-4 h-40 w-40 rounded-2xl object-cover shadow-lg" />
            )}
            <p className="font-display text-2xl font-extrabold">{gift.name}</p>
            {gift.price && <p className="mt-1 font-display text-lg font-extrabold text-party-yellow">{gift.price}</p>}
            <p className="mt-2 text-sm font-semibold text-white/80">{joke}</p>
            {gift.productUrl && (
              <a
                href={gift.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block break-all text-sm font-bold text-white underline underline-offset-2"
              >
                View the gift ↗
              </a>
            )}
          </>
        )}
      </motion.div>

      {error && (
        <p role="alert" className="max-w-sm font-semibold text-yellow-200">
          {error}
          {retriesRemaining === 0 && !submitted && ' No more tries left — head back and start over.'}
        </p>
      )}

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

      {!submitted && (
        <div className="flex gap-3">
          <motion.button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={submitting}
            whileHover={{ scale: submitting ? 1 : 1.05 }}
            whileTap={{ scale: submitting ? 1 : 0.92 }}
            className="rounded-full bg-party-yellow px-8 py-3 text-lg font-extrabold text-purple-900 shadow-lg shadow-black/20 disabled:opacity-50"
          >
            {submitting ? 'Locking in...' : 'Submit'}
          </motion.button>
          {retriesRemaining > 0 && (
            <motion.button
              type="button"
              onClick={handleRetry}
              disabled={submitting}
              whileHover={{ scale: submitting ? 1 : 1.05 }}
              whileTap={{ scale: submitting ? 1 : 0.92 }}
              className="rounded-full bg-white/20 px-8 py-3 text-lg font-extrabold text-white shadow-lg shadow-black/20 disabled:opacity-50"
            >
              Retry
            </motion.button>
          )}
        </div>
      )}

      {submitted && (
        <p className="font-display text-xl font-extrabold text-green-200">
          {isCash ? '✅ Locked in!' : '✅ Locked in! Go spend responsibly 😂'}
        </p>
      )}

      <button type="button" onClick={handleBackToStart} className="text-sm font-semibold text-white/70 underline">
        {backLabel}
      </button>

      <ConfirmDialog
        open={confirming}
        title={isCash ? 'You sure about this?' : 'Are you sure??'}
        description={
          isCash
            ? "Hitting submit means cash it is 😏 No take-backs."
            : "Hitting submit means you're LEGALLY buying this. Probably. 😂"
        }
        confirmLabel={isCash ? 'Yep, cash it is' : 'Yes, lock it in'}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
