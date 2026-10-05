/** A finite rate greater than zero, or null for blank, malformed, zero, or negative input. */
export function parsePositiveRate(value: string | number | null | undefined): number | null {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
