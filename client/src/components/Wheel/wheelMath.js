export function getSegmentAngles(index, total) {
  const segmentSize = 360 / total;
  const startAngle = index * segmentSize;
  const endAngle = startAngle + segmentSize;
  const midAngle = startAngle + segmentSize / 2;
  return { startAngle, endAngle, midAngle };
}

export function getTargetRotation({ segmentIndex, totalSegments, previousRotation = 0, fullSpins = 6 }) {
  const { midAngle } = getSegmentAngles(segmentIndex, totalSegments);
  const targetMod = ((-midAngle % 360) + 360) % 360;
  const currentMod = ((previousRotation % 360) + 360) % 360;
  let delta = targetMod - currentMod;
  if (delta <= 0) delta += 360;
  return previousRotation + fullSpins * 360 + delta;
}

function polarToCartesian(cx, cy, radius, angleDegreesFromTop) {
  const angleRad = (angleDegreesFromTop * Math.PI) / 180;
  return {
    x: cx + radius * Math.sin(angleRad),
    y: cy - radius * Math.cos(angleRad),
  };
}

export function describeSlicePath(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [`M ${cx} ${cy}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, 'Z'].join(
    ' '
  );
}

export const SEGMENT_COLORS = ['#ff3ea5', '#7c3aed', '#ffd60a', '#06d6a0', '#ff6b35', '#3b82f6', '#f43f5e', '#22c55e'];

export function colorForSegment(index) {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}
