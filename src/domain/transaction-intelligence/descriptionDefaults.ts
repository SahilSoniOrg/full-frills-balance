/** Explicitly approved descriptions are scoped to merchant, amount, currency, and kind. */
export function captureDescriptionKey(
  merchant: string | undefined,
  amount: number,
  currencyCode: string,
  kind: 'expense' | 'income' | 'transfer',
): string | undefined {
  const normalized = merchant?.trim().toLowerCase();
  if (!normalized || !Number.isFinite(amount) || amount <= 0 || !currencyCode) return undefined;
  return JSON.stringify([normalized, amount, currencyCode, kind]);
}
