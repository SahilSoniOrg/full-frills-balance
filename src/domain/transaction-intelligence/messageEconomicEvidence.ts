import type { EconomicEvidence } from '@/src/domain/transaction-intelligence/captureDecision';

/** Conservative message evidence; these facts do not authorize posting. */
export function extractMessageEconomicEvidence(body: string): EconomicEvidence {
  if (
    /\b(?:otp|one.time.password|failed|declined|unsuccessful|pending|scheduled|requested|request|authori[sz](?:ation|ed)|on\s+hold|will|can|offer|eligible|discount|earn|rewards?|not\s+(?:debited|charged)|due)\b/i.test(
      body,
    )
  )
    return 'incomplete';
  if (/\b(?:refund(?:ed)?|revers(?:ed|al)|returned)\b/i.test(body)) return 'refund';
  if (/\b(?:cashback|loan|withdraw(?:al|n)?|atm)\b/i.test(body)) return 'unknown';
  if (
    /\bsalary\b(?!\s+account\b).{0,60}\bcredited\b|\bcredited\b.{0,60}\b(?:as|towards)\s+salary\b/i.test(
      body,
    )
  )
    return 'salary';
  if (/\b(?:transfer(?:red)?|upi|neft|imps|rtgs)\b/i.test(body)) return 'transfer';
  if (
    /\b(?:spent|purchase(?:d)?|pos)\b/i.test(body) &&
    /\b(?:card|pos)\b/i.test(body) &&
    /\bat\s+\S/i.test(body)
  )
    return 'purchase';
  return 'unknown';
}
