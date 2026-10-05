import { Typography } from '@/src/constants';
import { resolveAmountTypography } from '../amountInputPresentation';

describe('resolveAmountTypography', () => {
  it.each([
    [3, Typography.sizes.jumbo],
    [7, Typography.sizes.xxxl],
    [10, Typography.sizes.xxl],
    [12, Typography.sizes.xl],
  ])('shrinks hero amount typography as length grows (%i chars)', (length, amountFontSize) => {
    expect(resolveAmountTypography(length).amountFontSize).toBe(amountFontSize);
  });
});
