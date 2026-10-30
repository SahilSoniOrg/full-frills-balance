/** Returns true when pasted amount text contains a Unicode or ASCII minus sign. */
export function hasNegativeAmountSign(amount: string): boolean {
  return /[-−﹣－]/.test(amount);
}
