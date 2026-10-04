export function inboxDirectionToParsedType(
  direction: 'debit' | 'credit' | 'unknown' | undefined,
): 'debit' | 'credit' | 'unknown' {
  if (direction === 'credit') return 'credit';
  if (direction === 'debit') return 'debit';
  return 'unknown';
}
