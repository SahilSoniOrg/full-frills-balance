export type SmsReferenceKind = 'upi' | 'utr' | 'rrn' | 'neft' | 'rtgs' | 'generic';

export type SmsPaymentChannel = 'upi' | 'imps' | 'neft' | 'rtgs' | 'card' | 'unknown';

export interface SmsReferenceResult {
  value: string;
  kind: SmsReferenceKind;
  confidence: number;
  paymentChannel: SmsPaymentChannel;
}

interface ReferencePattern {
  kind: SmsReferenceKind;
  confidence: number;
  regex: RegExp;
}

const REFERENCE_PATTERNS: ReferencePattern[] = [
  {
    kind: 'upi',
    confidence: 0.95,
    regex: /\(\s*upi\s+ref(?:erence)?(?:\s+no)?\.?\s*([a-z0-9]{6,30})\s*\)/i,
  },
  {
    kind: 'upi',
    confidence: 0.95,
    regex: /\bupi\s+ref(?:erence)?(?:\s+(?:no|#))?\.?\s*[:#\-.]?\s*([a-z0-9]{6,30})\b/i,
  },
  {
    kind: 'utr',
    confidence: 0.92,
    regex: /\butr(?:\s+(?:no|#|number))?\.?\s*[:#\-.]?\s*([a-z0-9]{6,30})\b/i,
  },
  {
    kind: 'rrn',
    confidence: 0.92,
    regex: /\brrn(?:\s+(?:no|#|number))?\.?\s*[:#\-.]?\s*([a-z0-9]{6,30})\b/i,
  },
  {
    kind: 'neft',
    confidence: 0.9,
    regex: /\bneft(?:\s+(?:ref|utr|no))?\.?\s*[:#\-.]?\s*([a-z]{4}[a-z0-9]{8,22}|\d{12,16})\b/i,
  },
  {
    kind: 'rtgs',
    confidence: 0.9,
    regex: /\brtgs(?:\s+(?:ref|utr|no))?\.?\s*[:#\-.]?\s*([a-z0-9]{10,30})\b/i,
  },
  {
    kind: 'generic',
    confidence: 0.72,
    regex:
      /\b(?:txn(?:\s+id)?|tx(?:\s+id)?|trx(?:\s+id)?|ref(?:erence)?(?:\s+(?:no|id|#))?|transaction\s+id|cheque(?:\s+no)?|order\s+id|trace(?:\s+id)?|tid)\s*[:#\-.]?\s*([a-z0-9]{6,30})\b/i,
  },
];

const ACCOUNT_OR_CARD_SPAN =
  /(?:a\/c|acct|account|card(?:\s+ending)?|card\s+xx|debit\s+card|credit\s+card)[^a-z0-9]{0,6}[x*•·]{0,6}\s?-?\s?\d{0,6}/gi;

const CARD_ENDING_SPAN = /(?:card|account)\s+ending\s+\d{3,6}/gi;

const AMOUNT_SPAN =
  /(?:amt|amount|inr|rs\.?|usd|eur|gbp|aed|₹|\$|€|£)\s*[:\-]?\s*[\d,.]+(?:\.\d+)?/gi;

const CHANNEL_RULES: { channel: SmsPaymentChannel; pattern: RegExp }[] = [
  { channel: 'upi', pattern: /\b(upi|vpa|@[a-z]{2,}|gpay|phonepe|bhim|paytm upi)\b/i },
  { channel: 'imps', pattern: /\bimps\b/i },
  { channel: 'neft', pattern: /\bneft\b/i },
  { channel: 'rtgs', pattern: /\brtgs\b/i },
  {
    channel: 'card',
    pattern: /\b(card|debit\s*card|credit\s*card|visa|mastercard|amex|rupay)\b/i,
  },
];

function collectExclusionSpans(body: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];

  for (const pattern of [ACCOUNT_OR_CARD_SPAN, CARD_ENDING_SPAN, AMOUNT_SPAN]) {
    pattern.lastIndex = 0;
    for (const match of body.matchAll(pattern)) {
      if (match.index === undefined) continue;
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
  }

  return spans;
}

function overlapsSpan(
  start: number,
  end: number,
  spans: { start: number; end: number }[],
): boolean {
  return spans.some(span => start < span.end && end > span.start);
}

export function normalizeSmsReferenceNumber(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

function isRejectedReference(
  value: string,
  body: string,
  matchStart: number,
  matchEnd: number,
  exclusionSpans: { start: number; end: number }[],
): boolean {
  if (overlapsSpan(matchStart, matchEnd, exclusionSpans)) {
    return true;
  }

  const digitsOnly = value.replace(/[^0-9]/g, '');
  if (digitsOnly.length === 4) {
    const context = body.slice(Math.max(0, matchStart - 24), Math.min(body.length, matchEnd + 8));
    if (/(?:ending|xx|[x*]{2})\s*$/i.test(context) || /\bending\s+\d{0,4}$/i.test(context)) {
      return true;
    }
  }

  if (/^\d+[.,]\d{2}$/.test(value) || /^\d{1,3}(?:,\d{3})+\.\d{2}$/.test(value)) {
    return true;
  }

  if (digitsOnly.length > 0 && digitsOnly.length <= 6) {
    const nearby = body.slice(Math.max(0, matchStart - 20), matchEnd + 4).toLowerCase();
    if (/(?:a\/c|acct|account|card|xx|\*{2,})/.test(nearby)) {
      return true;
    }
  }

  return false;
}

function detectPaymentChannel(body: string, kind: SmsReferenceKind): SmsPaymentChannel {
  for (const rule of CHANNEL_RULES) {
    if (rule.pattern.test(body)) {
      return rule.channel;
    }
  }

  if (kind === 'upi') return 'upi';
  if (kind === 'neft') return 'neft';
  if (kind === 'rtgs') return 'rtgs';
  return 'unknown';
}

export function extractSmsReference(body: string): SmsReferenceResult | null {
  if (!body || body.trim().length === 0) {
    return null;
  }

  const exclusionSpans = collectExclusionSpans(body);

  for (const pattern of REFERENCE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    const match = pattern.regex.exec(body);
    if (!match?.[1] || match.index === undefined) {
      continue;
    }

    const value = normalizeSmsReferenceNumber(match[1]);
    const matchStart = match.index + match[0].indexOf(match[1]);
    const matchEnd = matchStart + match[1].length;

    if (value.length < 6) {
      continue;
    }

    if (isRejectedReference(value, body, matchStart, matchEnd, exclusionSpans)) {
      continue;
    }

    return {
      value,
      kind: pattern.kind,
      confidence: pattern.confidence,
      paymentChannel: detectPaymentChannel(body, pattern.kind),
    };
  }

  return null;
}
