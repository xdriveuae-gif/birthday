import { motion } from 'framer-motion';
import { getSegmentAngles, describeSlicePath, colorForSegment } from './wheelMath.js';

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 8;

export function Wheel({ segments, rotation, spinning }) {
  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
      <div
        className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/4 text-4xl drop-shadow-lg"
        aria-hidden="true"
      >
        🔻
      </div>
      <motion.svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        animate={{ rotate: rotation }}
        transition={spinning ? { duration: 5, ease: [0.15, 0.85, 0.25, 1] } : { duration: 0 }}
        className="rounded-full border-8 border-white shadow-2xl"
      >
        {segments.map((segment, index) => {
          const { startAngle, endAngle, midAngle } = getSegmentAngles(index, segments.length);
          const path = describeSlicePath(CENTER, CENTER, RADIUS, startAngle, endAngle);
          const labelRad = (midAngle * Math.PI) / 180;
          const labelX = CENTER + RADIUS * 0.62 * Math.sin(labelRad);
          const labelY = CENTER - RADIUS * 0.62 * Math.cos(labelRad);
          return (
            <g key={segment.id}>
              <path d={path} fill={colorForSegment(index)} stroke="white" strokeWidth={2} />
              <text
                x={labelX}
                y={labelY}
                fill="white"
                fontSize={13}
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${midAngle}, ${labelX}, ${labelY})`}
              >
                {segment.name.length > 14 ? `${segment.name.slice(0, 13)}…` : segment.name}
              </text>
            </g>
          );
        })}
      </motion.svg>
    </div>
  );
}
