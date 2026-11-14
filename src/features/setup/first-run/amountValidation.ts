import { CURRENCY_PRECISIONS } from '@/src/constants/currency-definitions';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';

export type AmountInputResult =
  | { readonly status: 'empty' }
  | { readonly status: 'invalid'; readonly reason: 'malformed' | 'precision' | 'non-finite' }
  | { readonly status: 'valid'; readonly value: number };

type LocaleNumberParts = {
  readonly decimal: string;
  readonly groups: readonly string[];
  readonly minus: string;
  readonly digits: ReadonlyMap<string, string>;
  readonly groupSizes: readonly number[];
};

const localePartsCache = new Map<string, LocaleNumberParts>();
const bidiControls = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu;

/** Format a trusted numeric fallback using the same separators the editor parser expects. */
export function formatAmountInput(value: number, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits: 20,
  });
  if (typeof formatter.formatToParts === 'function') {
    return formatter
      .formatToParts(value)
      .filter(part => part.type !== 'literal')
      .map(part => part.value)
      .join('');
  }
  return formatter.format(value).replace(bidiControls, '');
}

function localeNumberParts(locale: string): LocaleNumberParts {
  const cached = localePartsCache.get(locale);
  if (cached) return cached;

  const ungroupedFormatter = new Intl.NumberFormat(locale, { useGrouping: false });
  const groupedFormatter = new Intl.NumberFormat(locale);
  const digits = new Map<string, string>();
  for (let digit = 0; digit <= 9; digit += 1) {
    const localized = ungroupedFormatter.format(digit).replace(bidiControls, '');
    digits.set(localized, String(digit));
  }

  const decimalParts =
    typeof ungroupedFormatter.formatToParts === 'function'
      ? ungroupedFormatter.formatToParts(1.1)
      : undefined;
  const decimal =
    decimalParts?.find(part => part.type === 'decimal')?.value ??
    separatorBetweenDigits(ungroupedFormatter.format(1.1), digits) ??
    '.';
  const minusParts =
    typeof ungroupedFormatter.formatToParts === 'function'
      ? ungroupedFormatter.formatToParts(-1)
      : undefined;
  const minus =
    minusParts?.find(part => part.type === 'minusSign')?.value ??
    (normalizeDigits(ungroupedFormatter.format(-1).replace(bidiControls, ''), digits).replace(
      /[\d\s]/gu,
      '',
    ) ||
      '-');
  const groupingParts =
    typeof groupedFormatter.formatToParts === 'function'
      ? groupedFormatter.formatToParts(123456789012345)
      : undefined;
  const fallbackGrouping = groupingParts
    ? undefined
    : groupingFromFormattedNumber(groupedFormatter.format(123456789012345), digits);
  const localizedGroups = groupingParts
    ? [...new Set(groupingParts.filter(part => part.type === 'group').map(part => part.value))]
    : [...new Set(fallbackGrouping?.groups ?? [])];
  const groups = localizedGroups.some(separator => /^\s+$/u.test(separator))
    ? [...new Set([...localizedGroups, ' ', '\u00a0', '\u202f'])]
    : localizedGroups;
  const integerGroups = groupingParts
    ? groupingParts.filter(part => part.type === 'integer').map(part => part.value)
    : (fallbackGrouping?.integerGroups ?? []);
  const groupSizes = integerGroups
    .slice(1)
    .reverse()
    .map(part => [...part].length);
  const parts = { decimal, groups, minus, digits, groupSizes };
  localePartsCache.set(locale, parts);
  return parts;
}

function separatorBetweenDigits(
  value: string,
  digits: ReadonlyMap<string, string>,
): string | undefined {
  const normalized = normalizeDigits(value.replace(bidiControls, ''), digits);
  return normalized.match(/^\d+([^\d]+)\d+$/u)?.[1];
}

function groupingFromFormattedNumber(
  value: string,
  digits: ReadonlyMap<string, string>,
): { readonly groups: readonly string[]; readonly integerGroups: readonly string[] } {
  const normalized = normalizeDigits(value.replace(bidiControls, ''), digits);
  const integerGroups = normalized.match(/\d+/gu) ?? [];
  const separators = [...normalized.matchAll(/\d+([^\d]+)(?=\d)/gu)].map(match => match[1]);
  return { groups: separators, integerGroups };
}

function normalizeDigits(value: string, digits: ReadonlyMap<string, string>): string {
  let normalized = value;
  for (const [localized, ascii] of digits) normalized = normalized.replaceAll(localized, ascii);
  return normalized;
}

function validGrouping(groups: readonly string[], expectedSizes: readonly number[]): boolean {
  if (groups.length <= 1) return true;
  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    if (!group || !/^\d+$/.test(group)) return false;
    const fromRight = groups.length - 1 - index;
    const expected = expectedSizes[Math.min(fromRight, expectedSizes.length - 1)] ?? 3;
    if (fromRight === groups.length - 1) {
      if (group.length < 1 || group.length > expected) return false;
    } else if (group.length !== expected) {
      return false;
    }
  }
  return true;
}

/** Strictly parses locale-formatted numeric input. Currency precision is independent of locale. */
export function parseAmountInput(
  raw: string,
  locale: string,
  precision: number,
): AmountInputResult {
  const trimmed = raw.trim();
  if (!trimmed) return { status: 'empty' };

  const parts = localeNumberParts(locale);
  const normalizedDigits = normalizeDigits(trimmed, parts.digits);
  let value = normalizedDigits.replaceAll(parts.minus, '-');
  if (value.startsWith('+')) value = value.slice(1);
  const sign = value.startsWith('-') ? '-' : '';
  if (sign) value = value.slice(1);
  if (!value || value.includes('+') || value.includes('-'))
    return { status: 'invalid', reason: 'malformed' };

  const decimalPieces = value.split(parts.decimal);
  if (decimalPieces.length > 2) return { status: 'invalid', reason: 'malformed' };
  const integerText = decimalPieces[0] ?? '';
  const fractionText = decimalPieces[1];
  if (fractionText !== undefined && !/^\d*$/.test(fractionText)) {
    return { status: 'invalid', reason: 'malformed' };
  }
  if (fractionText === '') return { status: 'invalid', reason: 'malformed' };
  if (fractionText !== undefined && fractionText.length > precision) {
    return { status: 'invalid', reason: 'precision' };
  }

  let integerDigits = integerText;
  if (parts.groups.some(separator => integerDigits.includes(separator))) {
    let chunks = [integerDigits];
    for (const separator of parts.groups) {
      if (integerDigits.includes(separator)) {
        if (chunks.length > 1) return { status: 'invalid', reason: 'malformed' };
        chunks = integerDigits.split(separator);
      }
    }
    if (!validGrouping(chunks, parts.groupSizes)) return { status: 'invalid', reason: 'malformed' };
    integerDigits = chunks.join('');
  }
  if (!integerDigits && fractionText === undefined)
    return { status: 'invalid', reason: 'malformed' };
  if (integerDigits && !/^\d+$/.test(integerDigits))
    return { status: 'invalid', reason: 'malformed' };
  if (fractionText === undefined && !integerDigits)
    return { status: 'invalid', reason: 'malformed' };

  const parsed = Number(
    `${sign}${integerDigits || '0'}${fractionText === undefined ? '' : `.${fractionText}`}`,
  );
  if (!Number.isFinite(parsed)) return { status: 'invalid', reason: 'non-finite' };
  return { status: 'valid', value: parsed };
}

export function currencyPrecision(currency: string): number {
  return CURRENCY_PRECISIONS[currency.trim().toUpperCase()] ?? 2;
}

export function amountIssueMessage(
  result: AmountInputResult,
  positiveOnly: boolean,
  signedAllowed: boolean,
): string | undefined {
  if (result.status === 'empty') return copy.amountEmpty;
  if (result.status === 'invalid') {
    if (result.reason === 'precision') return copy.amountPrecision;
    if (result.reason === 'non-finite') return copy.amountNonFinite;
    return copy.amountMalformed;
  }
  if (!signedAllowed && result.value < 0) return copy.amountNonNegative;
  if (positiveOnly && result.value <= 0) return copy.amountPositive;
  return undefined;
}
