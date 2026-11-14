import { hashLegacySmsFingerprint } from '@/src/domain/transaction-intelligence/smsFingerprintHash';

export const SMS_REDELIVERY_WINDOW_MS = 10_000;

/** Full-content identity; unlike legacy journal fingerprints, it never truncates the body. */
export function smsContentDigest(sender: string, body: string): string {
  const content = JSON.stringify([sender.toLowerCase(), body.replace(/\s+/g, ' ').trim()]);
  // The portable SHA implementation accepts ASCII; encode code points without losing Unicode.
  return hashLegacySmsFingerprint(
    Array.from(content, char => char.codePointAt(0)!.toString(16)).join(','),
  );
}

export function isSmsRedelivery(
  a: { contentDigest?: string; inputDate: number },
  b: { contentDigest?: string; inputDate: number },
): boolean {
  return Boolean(
    a.contentDigest &&
    a.contentDigest === b.contentDigest &&
    Math.abs(a.inputDate - b.inputDate) <= SMS_REDELIVERY_WINDOW_MS,
  );
}
