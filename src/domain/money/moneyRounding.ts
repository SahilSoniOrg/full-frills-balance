/** Whole minor units shared by arithmetic and background financial calculations. */
export const toMinorUnits = (amount: number, precision: number): number => {
  'worklet';
  return Math.round((amount + Number.EPSILON) * 10 ** precision);
};

/** Keep edge rounding identical for major-unit and minor-unit callers. */
export const roundToPrecision = (amount: number, precision: number): number => {
  'worklet';
  return toMinorUnits(amount, precision) / 10 ** precision;
};
