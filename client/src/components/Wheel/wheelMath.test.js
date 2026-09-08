import { describe, test, expect } from 'vitest';
import { getSegmentAngles, getTargetRotation, colorForSegment, SEGMENT_COLORS } from './wheelMath.js';

describe('getSegmentAngles', () => {
  test('divides the circle evenly across segments', () => {
    expect(getSegmentAngles(0, 4)).toEqual({ startAngle: 0, endAngle: 90, midAngle: 45 });
    expect(getSegmentAngles(2, 4)).toEqual({ startAngle: 180, endAngle: 270, midAngle: 225 });
  });
});

describe('getTargetRotation', () => {
  test('always spins forward by at least fullSpins full turns', () => {
    const rotation = getTargetRotation({ segmentIndex: 0, totalSegments: 4, previousRotation: 0, fullSpins: 6 });
    expect(rotation).toBeGreaterThanOrEqual(6 * 360);
  });

  test('ends exactly on the target segment midpoint regardless of previous rotation', () => {
    for (const previousRotation of [0, 123, 700, 4000]) {
      const rotation = getTargetRotation({ segmentIndex: 1, totalSegments: 4, previousRotation, fullSpins: 5 });
      const { midAngle } = getSegmentAngles(1, 4);
      const expectedMod = ((-midAngle % 360) + 360) % 360;
      expect(rotation % 360).toBeCloseTo(expectedMod, 5);
      expect(rotation).toBeGreaterThan(previousRotation);
    }
  });

  test('a later spin always rotates further than the one before it', () => {
    const first = getTargetRotation({ segmentIndex: 2, totalSegments: 5, previousRotation: 0 });
    const second = getTargetRotation({ segmentIndex: 0, totalSegments: 5, previousRotation: first });
    expect(second).toBeGreaterThan(first);
  });
});

describe('colorForSegment', () => {
  test('cycles through the fixed palette', () => {
    expect(colorForSegment(0)).toBe(SEGMENT_COLORS[0]);
    expect(colorForSegment(SEGMENT_COLORS.length)).toBe(SEGMENT_COLORS[0]);
  });
});
