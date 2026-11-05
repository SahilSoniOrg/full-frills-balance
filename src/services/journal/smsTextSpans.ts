export interface SmsTextSpan {
  start: number;
  end: number;
}

export interface SmsWordToken extends SmsTextSpan {
  index: number;
  text: string;
}

export function tokenizeSmsWords(body: string): SmsWordToken[] {
  const tokens: SmsWordToken[] = [];
  const words = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:[’'][\p{L}\p{M}\p{N}]+)*/gu;
  for (const match of body.matchAll(words)) {
    const start = match.index;
    tokens.push({ index: tokens.length, start, end: start + match[0].length, text: match[0] });
  }
  return tokens;
}

/** Merge selected adjacent words while preserving the original body offsets and punctuation. */
export function mergeSelectedSmsWordSpans(
  tokens: readonly SmsWordToken[],
  selectedIndexes: ReadonlySet<number>,
): SmsTextSpan[] {
  const selected = tokens.filter(token => selectedIndexes.has(token.index));
  const spans: SmsTextSpan[] = [];
  let previousIndex: number | undefined;
  for (const token of selected) {
    const previous = spans[spans.length - 1];
    if (previous && previousIndex !== undefined && token.index === previousIndex + 1) {
      previous.end = token.end;
    } else {
      spans.push({ start: token.start, end: token.end });
    }
    previousIndex = token.index;
  }
  return spans;
}

export function selectedSmsWordIndexes(
  tokens: readonly SmsWordToken[],
  spans: readonly SmsTextSpan[],
): Set<number> {
  return new Set(
    tokens
      .filter(token => spans.some(span => token.start >= span.start && token.end <= span.end))
      .map(token => token.index),
  );
}

export function fragmentsFromSmsSpans(body: string, spans: readonly SmsTextSpan[]): string[] {
  return spans.map(span => body.slice(span.start, span.end)).filter(Boolean);
}

export function splitSmsTextBySpans(
  body: string,
  spans: readonly SmsTextSpan[],
): { text: string; start: number; end: number; highlighted: boolean }[] {
  const chunks: { text: string; start: number; end: number; highlighted: boolean }[] = [];
  let cursor = 0;
  for (const span of [...spans].sort((left, right) => left.start - right.start)) {
    const start = Math.max(cursor, Math.min(body.length, span.start));
    const end = Math.max(start, Math.min(body.length, span.end));
    if (start > cursor) {
      chunks.push({
        text: body.slice(cursor, start),
        start: cursor,
        end: start,
        highlighted: false,
      });
    }
    if (end > start) {
      chunks.push({ text: body.slice(start, end), start, end, highlighted: true });
    }
    cursor = end;
  }
  if (cursor < body.length) {
    chunks.push({ text: body.slice(cursor), start: cursor, end: body.length, highlighted: false });
  }
  return chunks;
}
