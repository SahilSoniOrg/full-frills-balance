export type SmsHighlightKind = 'amount' | 'account' | 'merchant' | 'reference';
export interface SmsHighlightRange {
  start: number;
  end: number;
  kind: SmsHighlightKind;
}

/** Match extracted values only; identifier ranges take precedence over numeric matches. */
export function findSmsHighlightRanges(
  rawBody: string,
  values: { amount?: number; accountHint?: string; merchant?: string; reference?: string },
): SmsHighlightRange[] {
  const ranges: SmsHighlightRange[] = [];
  const add = (start: number, end: number, kind: SmsHighlightKind) => {
    if (!ranges.some(range => start < range.end && end > range.start)) {
      ranges.push({ start, end, kind });
    }
  };
  for (const [kind, value] of [
    ['reference', values.reference],
    ['account', values.accountHint],
    ['merchant', values.merchant],
  ] as const) {
    if (!value) continue;
    const body = kind === 'merchant' ? rawBody.toLowerCase() : rawBody;
    const needle = kind === 'merchant' ? value.toLowerCase() : value;
    let start = body.indexOf(needle);
    while (start >= 0) {
      add(start, start + value.length, kind);
      start = body.indexOf(needle, start + value.length);
    }
  }
  if (values.amount !== undefined && Number.isFinite(values.amount)) {
    for (const match of rawBody.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
      const start = match.index;
      const end = start + match[0].length;
      const prefix = rawBody
        .slice(0, start)
        .match(/(?:\b(?:Rs\.?|INR|USD|EUR|GBP)\s*|[₹$€£]\s*)$/i);
      // Dates, times, account suffixes, malformed separators are not amounts.
      if (!prefix && /[\w/:.\-]/.test(rawBody[start - 1] ?? '')) continue;
      if (
        /[\w/:\-]/.test(rawBody[end] ?? '') ||
        (rawBody[end] === '.' && /\d/.test(rawBody[end + 1] ?? ''))
      )
        continue;
      if (match[0].includes(',') && !/^\d{1,3}(?:,\d{2,3})*(?:,\d{3})(?:\.\d+)?$/.test(match[0]))
        continue;
      const parsed = Number(match[0].replace(/,/g, ''));
      if (parsed === values.amount) add(prefix ? start - prefix[0].length : start, end, 'amount');
    }
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/** Cuts `body` into consecutive pieces; `ranges` must be sorted and non-overlapping. */
export function splitSmsByHighlights(
  body: string,
  ranges: readonly SmsHighlightRange[],
): { text: string; kind?: SmsHighlightKind }[] {
  const chunks: { text: string; kind?: SmsHighlightKind }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) chunks.push({ text: body.slice(cursor, range.start) });
    chunks.push({ text: body.slice(range.start, range.end), kind: range.kind });
    cursor = range.end;
  }
  if (cursor < body.length) chunks.push({ text: body.slice(cursor) });
  return chunks;
}
