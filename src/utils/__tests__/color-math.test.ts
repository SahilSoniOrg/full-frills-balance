import { getContrastRatio, getLuminance, getReadableColor } from '../color-math';

const ratio = (foreground: string, background: string) =>
  getContrastRatio(getLuminance(foreground), getLuminance(background));

const channels = (color: string) =>
  [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));

describe('getReadableColor', () => {
  it('preserves an accent that is already readable', () => {
    expect(getReadableColor('#F2994A', '#432D1B')).toBe('#F2994A');
  });

  it('darkens amber on a light tint without replacing its hue with gray', () => {
    const foreground = '#F2994A';
    const background = '#FFF5E5';
    const result = getReadableColor(foreground, background);
    const [red, green, blue] = channels(result);
    const [originalRed, originalGreen, originalBlue] = channels(foreground);
    expect(ratio(result, background)).toBeGreaterThanOrEqual(4.5);
    expect(red).toBeLessThan(originalRed);
    expect(red).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(blue);
    expect((red - green) / (red - blue)).toBeCloseTo(
      (originalRed - originalGreen) / (originalRed - originalBlue),
      1,
    );
  });

  it('lightens a dark blue accent on a dark tint while retaining its hue', () => {
    const background = '#1F2C3D';
    const result = getReadableColor('#203044', background);
    const [red, green, blue] = channels(result);
    expect(ratio(result, background)).toBeGreaterThanOrEqual(4.5);
    expect(red).toBeGreaterThan(0x20);
    expect(blue).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(red);
  });

  it.each(['#000000', '#FFFFFF', '#777777'])(
    'makes a matching foreground readable on %s',
    background => {
      expect(ratio(getReadableColor(background, background), background)).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );
});
