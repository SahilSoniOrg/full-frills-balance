import {
  recenterRepeatingIndex,
  repeatingCopyCount,
  repeatingIndexForValue,
} from './clockWheelLoop';

describe('clockWheelLoop', () => {
  it('uses at least three copies so both ends can scroll', () => {
    expect(repeatingCopyCount(60)).toBe(3);
    expect(repeatingCopyCount(24)).toBe(3);
    expect(repeatingCopyCount(12)).toBe(3);
  });

  it('places the selected value in the middle copy', () => {
    expect(repeatingIndexForValue(0, 24, 3)).toBe(24);
    expect(repeatingIndexForValue(14, 24, 3)).toBe(38);
  });

  it('recenters the first and last copies onto the middle copy', () => {
    expect(recenterRepeatingIndex(0, 24, 3)).toBe(24);
    expect(recenterRepeatingIndex(23, 24, 3)).toBe(47);
    expect(recenterRepeatingIndex(48, 24, 3)).toBe(24);
    expect(recenterRepeatingIndex(38, 24, 3)).toBe(38);
  });
});
