/** Edge rounding shared with the background financial calculation. */
export const roundToPrecision = (amount: number, precision: number): number => {
  'worklet';
  const factor = Math.pow(10, precision);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
};
