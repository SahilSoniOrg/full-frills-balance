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

export interface ParsedCaptureDescriptionKey {
  amount?: number;
  currencyCode?: string;
  kind?: string;
}

/** Parses serialized scope fields from `captureDescriptionKey`, ignoring malformed legacy payloads. */
export function parseCaptureDescriptionKey(
  key: string | undefined,
): ParsedCaptureDescriptionKey | undefined {
  if (!key) return undefined;
  try {
    const parts: unknown = JSON.parse(key);
    if (Array.isArray(parts)) {
      return {
        amount: typeof parts[1] === 'number' ? parts[1] : undefined,
        currencyCode: typeof parts[2] === 'string' ? parts[2] : undefined,
        kind: typeof parts[3] === 'string' ? parts[3] : undefined,
      };
    }
  } catch {
    // Legacy keys that cannot be parsed still leave the candidate reviewable.
  }
  return undefined;
}
