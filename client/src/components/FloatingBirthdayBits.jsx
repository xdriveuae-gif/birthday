import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../lib/useReducedMotion.js';

const EMOJIS = ['🎈', '🎉', '🎂', '✨', '🎁', '🥳', '🍰', '🎊'];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function FloatingBirthdayBits({ count = 14 }) {
  const reducedMotion = useReducedMotion();
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        emoji: EMOJIS[i % EMOJIS.length],
        left: randomBetween(0, 100),
        size: randomBetween(1.5, 3),
        duration: randomBetween(10, 20),
        delay: randomBetween(0, 6),
      })),
    [count]
  );

  if (reducedMotion) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {bits.map((bit) => (
        <motion.span
          key={bit.id}
          className="absolute select-none"
          style={{ left: `${bit.left}%`, fontSize: `${bit.size}rem`, bottom: '-10%' }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: '-120vh', opacity: [0, 1, 1, 0] }}
          transition={{ duration: bit.duration, delay: bit.delay, repeat: Infinity, ease: 'linear' }}
        >
          {bit.emoji}
        </motion.span>
      ))}
    </div>
  );
}
