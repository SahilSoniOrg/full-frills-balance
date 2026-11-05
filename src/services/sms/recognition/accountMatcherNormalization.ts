import { AppConfig } from '@/src/constants/app-config';

export interface NormalizedText {
  value: string;
  originalIndex: number[];
}
export function normalizeWithMap(
  input: string,
  limit = AppConfig.input.sms.maxBodyMatchLength,
): NormalizedText {
  const source = input.slice(0, limit);
  let value = '';
  const originalIndex: number[] = [];
  let pendingSpace = false;
  let spaceAt = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (/\s/u.test(char)) {
      if (value.length) {
        pendingSpace = true;
        spaceAt = i;
      }
      continue;
    }
    if (pendingSpace) {
      value += ' ';
      originalIndex.push(spaceAt);
      pendingSpace = false;
    }
    const folded = char.toLocaleLowerCase();
    value += folded;
    for (let j = 0; j < folded.length; j += 1) originalIndex.push(i);
  }
  return { value, originalIndex };
}
export const normalizeMatcherText = (value: string): string => normalizeWithMap(value).value;
export function normalizeSenderHeader(sender: string): string {
  return sender
    .trim()
    .replace(/^[A-Z]{2}-/i, '')
    .replace(/-[A-Z]$/i, '')
    .toLocaleUpperCase();
}
export function originalSpan(
  normalized: NormalizedText,
  start: number,
  end: number,
): { start: number; end: number } {
  return {
    start: normalized.originalIndex[start] ?? 0,
    end: (normalized.originalIndex[end - 1] ?? -1) + 1,
  };
}
export const SENDER_MATCH_LIMIT = AppConfig.input.sms.maxSenderMatchLength;
export const BODY_MATCH_LIMIT = AppConfig.input.sms.maxBodyMatchLength;

/** Ordered literal matching shared by runtime evaluation and the visual phrase editor. */
export function findMatcherFragmentSpans(
  body: string,
  fragments: readonly string[],
): { start: number; end: number }[] | null {
  const normalized = normalizeWithMap(body);
  const spans: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const fragment of fragments) {
    const needle = normalizeMatcherText(fragment);
    if (!needle) return null;
    const index = normalized.value.indexOf(needle, cursor);
    if (index < 0) return null;
    spans.push(originalSpan(normalized, index, index + needle.length));
    cursor = index + needle.length;
  }
  return spans;
}
