import { Typography } from '@/src/constants';
import { getHeroAmountFontSize } from '@/src/components/forms/CalculatorAmountInput';

describe('getHeroAmountFontSize', () => {
  it('keeps normal amounts at the hero size', () => {
    expect(getHeroAmountFontSize('12345.67')).toBe(Typography.sizes.hero / 1.5);
  });

  it('shrinks long amounts but keeps a readable minimum', () => {
    expect(getHeroAmountFontSize('123456789012345.67')).toBe(Typography.sizes.xxl);
    expect(getHeroAmountFontSize('123456789.01')).toBeLessThan(Typography.sizes.hero / 1.5);
  });
});
