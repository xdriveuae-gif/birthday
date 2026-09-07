import { motion } from 'framer-motion';
import { useReducedMotion } from '../lib/useReducedMotion.js';

const COLORS = ['#ff3ea5', '#7c3aed', '#ffd60a', '#06d6a0', '#ff6b35'];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function Confetti({ count = 60 }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;

  const pieces = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: randomBetween(0, 100),
    color: COLORS[i % COLORS.length],
    size: randomBetween(6, 12),
    duration: randomBetween(2.5, 4.5),
    delay: randomBetween(0, 0.6),
    rotate: randomBetween(0, 360),
  }));

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-[-5%] block"
          style={{ left: `${p.left}%`, width: p.size, height: p.size * 0.4, backgroundColor: p.color }}
          initial={{ y: 0, opacity: 1, rotate: 0 }}
          animate={{ y: '110vh', opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}
