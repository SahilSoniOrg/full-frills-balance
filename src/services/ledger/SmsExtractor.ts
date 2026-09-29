import { COMMON_CURRENCIES } from '@/src/constants/currency-definitions';
import { extractSmsReference } from '@/src/utils/sms/SmsReferenceExtractor';
import { ExtractedInfo, RawTransactionInput, TransactionExtractor } from './TransactionExtractor';
import { SMS_TRANSACTION_TEMPLATES, SmsTransactionTemplate } from './smsTransactionTemplates';

const currencyCodes = COMMON_CURRENCIES.map(currency => currency.code).sort(
  (a, b) => b.length - a.length,
);
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const currencySymbols = Array.from(new Set(COMMON_CURRENCIES.map(currency => currency.symbol)))
  .filter(Boolean)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex);
const currencyToken =
  '(?:US\\$|A\\$|AU\\$|CA\\$|NZ\\$|HK\\$|SG\\$|R\\$|Rs\\.?|' +
  '(?:' + currencyCodes.join('|') + ')\\.?|' +
  currencySymbols.join('|') +
  ')';
const amountToken = '(?:\\d{1,3}(?:[, .\\u00a0]\\d{2,3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)';

const compiledTemplates = SMS_TRANSACTION_TEMPLATES.flatMap(template => {
  try {
    return [
      {
        template,
        body: new RegExp(template.bodyPattern, 'i'),
        sender: template.senderPattern ? new RegExp(template.senderPattern, 'i') : undefined,
      },
    ];
  } catch {
    // A malformed template is skipped; it cannot make inbox scanning fail.
    return [];
  }
});

type Direction = 'debit' | 'credit' | 'unknown';

interface AmountCandidate {
  amount: number;
  currencyCode?: string;
  score: number;
  start: number;
  end: number;
}

interface TemplateMatch {
  template: SmsTransactionTemplate;
  direction: Exclude<Direction, 'unknown'>;
  amount: number;
  currencyCode?: string;
}

export class SmsExtractor implements TransactionExtractor {
  canExtract(input: RawTransactionInput): boolean {
    return input.channel === 'sms';
  }

  async extract(input: RawTransactionInput): Promise<ExtractedInfo> {
    const body = input.rawText;
    const requiresReview = this.isFailedOrFutureTransaction(body);
    const classifiedDirection = this.classifyDirection(body);
    const direction = requiresReview ? 'unknown' : classifiedDirection;
    const transactionLike = this.isTransactionLike(body);
    const templateMatch = this.matchTemplate(input.senderAddress || '', body);
    const amountCandidate = templateMatch
      ? undefined
      : this.extractContextualAmount(body, transactionLike);
    const merchant = this.extractMerchant(body, direction);
    const reference = extractSmsReference(body);

    return {
      amount: templateMatch?.amount ?? amountCandidate?.amount,
      currencyCode: templateMatch?.currencyCode ?? amountCandidate?.currencyCode,
      direction:
        !requiresReview && templateMatch && classifiedDirection === templateMatch.direction
          ? templateMatch.direction
          : direction,
      referenceNumber: reference?.value,
      sourceAccountHint: this.extractAccountSource(body),
      destinationCategoryHint: merchant,
      merchantName: merchant,
      date: input.date,
      isTransactionLike: transactionLike,
      parseConfidence: templateMatch
        ? templateMatch.currencyCode
          ? templateMatch.template.confidence
          : Math.min(templateMatch.template.confidence, 0.82)
        : amountCandidate
          ? Math.min(amountCandidate.score / 10, amountCandidate.currencyCode ? 0.86 : 0.78)
          : undefined,
      parseReason: templateMatch
        ? `Matched SMS format ${templateMatch.template.id} v${templateMatch.template.version}`
        : amountCandidate
          ? 'Parsed transaction from amount context'
          : undefined,
    };
  }

  private matchTemplate(sender: string, body: string): TemplateMatch | undefined {
    const matches: TemplateMatch[] = [];

    for (const { template, body: bodyRegex, sender: senderRegex } of compiledTemplates) {
      if (senderRegex && !senderRegex.test(sender)) continue;
      const match = body.match(bodyRegex);
      if (!match) continue;

      const fields = new Map<string, string | undefined>(
        template.captures.map(
          (field, index): [string, string | undefined] => [field, match[index + 1]],
        ),
      );
      const verb = (fields.get('direction') || '').toLowerCase();
      const direction = template.directionMap[verb];
      const amount = this.normalizeAmount(fields.get('amount') || '');
      if (!direction || amount == null) continue;

      const currencyCode =
        this.normalizeCurrencyCode(fields.get('currency')) ??
        this.normalizeCurrencyCode(fields.get('currencySuffix'));
      matches.push({
        template,
        direction,
        amount,
        currencyCode,
      });
    }

    if (matches.length === 0) return undefined;
    const distinct = new Map<string, TemplateMatch>(
      matches.map(
        (match): [string, TemplateMatch] => [
          `${match.direction}:${match.amount}:${match.currencyCode || ''}`,
          match,
        ],
      ),
    );
    if (distinct.size !== 1) return undefined;
    return matches.sort((a, b) => b.template.confidence - a.template.confidence)[0];
  }

  private classifyDirection(body: string): Direction {
    const text = body.toLowerCase();
    if (this.isFailedOrFutureTransaction(text)) return 'unknown';
    const isReversal = /\b(?:refund(?:ed)?|reversed|reversal)\b/.test(text);
    if (isReversal) return 'credit';

    const hasDebit =
      /\b(?:debited|spent|paid|charged|purchase(?:d)?|withdraw(?:n|al))\b|\bdebit\s+(?:of|for|to\s+(?:your\s+)?(?:account|card))\b/.test(
        text,
      );
    const hasCredit =
      /\b(?:credited|received|deposit(?:ed)?)\b|\bcredit\s+(?:of|for|to)\b/.test(text);
    if (hasDebit && hasCredit) return 'unknown';
    if (hasDebit) return 'debit';
    if (hasCredit) return 'credit';
    return 'unknown';
  }

  private isTransactionLike(body: string): boolean {
    const strongTransactionSignal =
      /\b(?:debited|credited|spent|paid|charged|purchase(?:d)?|withdraw(?:n|al)|received|deposit(?:ed)?|refund(?:ed)?|reversed|transaction|txn|transfer|payment|declined|failed|unsuccessful|scheduled|upcoming|standing order|mandate|pending|authorized|authorization|preauthorized)\b|\b(?:debit|credit)\s+(?:of|for|to)\b/i.test(
        body,
      );
    if (strongTransactionSignal) return true;

    if (/\b(?:balance|credit limit|minimum due|statement|otp|verification code)\b/i.test(body)) {
      return false;
    }

    const hasMoney = new RegExp(
      `(?:${currencyToken}\\s*${amountToken}|${amountToken}\\s*${currencyToken})`,
      'i',
    ).test(body);
    return hasMoney && /\b(?:card|account|bank|wallet|a\/c|acct)\b/i.test(body);
  }

  private isFailedOrFutureTransaction(body: string): boolean {
    return /\b(?:failed|declined|unsuccessful|rejected|cancelled|canceled|voided|not completed|scheduled|upcoming|standing order|mandate|pending|authorized|authorization|preauthorized)\b|\bwill be (?:debited|charged)\b|\b(?:not|never)\s+(?:successfully\s+)?(?:debited|charged|completed|processed)\b|\b(?:could not|unable to)\s+(?:debit|charge|process)\b/i.test(
      body,
    );
  }

  private extractContextualAmount(body: string, transactionLike: boolean): AmountCandidate | undefined {
    if (!transactionLike) return undefined;

    const candidates: AmountCandidate[] = [];
    const regex = new RegExp(
      `(?:(${currencyToken})\\s*)?(${amountToken})(?:\\s*(${currencyToken}))?`,
      'gi',
    );

    let match: RegExpExecArray | null;
    while ((match = regex.exec(body)) !== null) {
      const amount = this.normalizeAmount(match[2]);
      if (amount == null) continue;

      const start = match.index + match[0].indexOf(match[2]);
      const end = start + match[2].length;
      const left = body.slice(Math.max(0, start - 42), start).toLowerCase();
      const right = body.slice(end, Math.min(body.length, end + 42)).toLowerCase();
      const context = `${left} ${right}`;

      if (
        /\b(?:balance|available|avl|avbl|limit|statement|minimum due|card ending|account ending|ref(?:erence)?|utr|rrn|otp|one.time code)\b/.test(
          context,
        )
      ) {
        continue;
      }

      const hasDirectionContext =
        /\b(?:debited|credited|spent|paid|charged|purchase(?:d)?|withdraw(?:n|al)|received|deposit(?:ed)?|refund(?:ed)?|reversed)\b|\b(?:debit|credit)\s+(?:of|for|to)\b/.test(
          context,
        );
      const hasAmountLabel = /\b(?:amount|amt|transaction of|txn of|purchase of|payment of)\b/.test(
        left,
      );
      if (!hasDirectionContext && !hasAmountLabel) continue;

      const currencyText = match[1] || match[3];
      const currencyCode = this.normalizeCurrencyCode(currencyText);
      const score = (hasDirectionContext ? 6 : 0) + (hasAmountLabel ? 3 : 0) + (currencyText ? 1 : 0);
      candidates.push({ amount, currencyCode, score, start, end });
    }

    if (candidates.length === 0) return undefined;
    candidates.sort((a, b) => b.score - a.score || a.start - b.start);
    const top = candidates[0];
    const conflicting = candidates.some(
      candidate =>
        candidate !== top &&
        candidate.score === top.score &&
        (candidate.amount !== top.amount || candidate.currencyCode !== top.currencyCode),
    );
    return conflicting ? undefined : top;
  }

  private extractMerchant(body: string, direction: Direction): string | undefined {
    const pattern =
      direction === 'credit'
        ? /\b(?:from|by)\s+(.+?)(?=\s+\b(?:on|ref|reference|utr|txn|transaction|bal|balance|avbl|available)\b|[,;\n]|$)/i
        : /\b(?:to|at|vpa|info[: ]+)\s+(.+?)(?=\s+\b(?:on|ref|reference|utr|txn|transaction|bal|balance|avbl|available)\b|[,;\n]|$)/i;
    const value = body.match(pattern)?.[1]?.trim().replace(/\s+/g, ' ');
    return value && value.length > 1 ? value : undefined;
  }

  private extractAccountSource(body: string): string | undefined {
    const sourceRegex =
      /(?:a\/c|acct|account|acc|card)\s*[:\-]?\s*[*xX.-]*(\d{3,6})|by\s+(UPI)|([xX*.]{2,}[\s\-]?\d{3,6})/i;
    const match = body.match(sourceRegex);
    if (!match) return undefined;
    if (match[1]) return `${/card/i.test(body) ? 'Card' : 'Account'} ${match[1]}`;
    if (match[2]) return 'UPI';
    if (match[3]) return `Account ${match[3].replace(/[^0-9]/g, '')}`;
    return undefined;
  }

  private normalizeAmount(raw: string): number | null {
    const trimmed = raw.trim().replace(/[()\s\u00a0]/g, '');
    if (!trimmed || !/^[+-]?[\d.,]+$/.test(trimmed)) return null;

    const sign = trimmed.startsWith('-') ? -1 : 1;
    const unsigned = trimmed.replace(/^[+-]/, '');
    const lastDot = unsigned.lastIndexOf('.');
    const lastComma = unsigned.lastIndexOf(',');
    let normalized: string;

    if (lastDot >= 0 && lastComma >= 0) {
      const decimalSeparator = lastDot > lastComma ? '.' : ',';
      const groupingSeparator = decimalSeparator === '.' ? ',' : '.';
      normalized = unsigned.split(groupingSeparator).join('');
      if (decimalSeparator === ',') normalized = normalized.replace(',', '.');
    } else if (lastComma >= 0) {
      const groups = unsigned.split(',');
      const isGrouping = this.isGroupedNumber(groups);
      const decimalIndex = unsigned.lastIndexOf(',');
      normalized = isGrouping
        ? groups.join('')
        : `${unsigned.slice(0, decimalIndex).replace(/,/g, '')}.${unsigned.slice(decimalIndex + 1)}`;
    } else if (lastDot >= 0 && unsigned.indexOf('.') !== lastDot) {
      const groups = unsigned.split('.');
      const isGrouping = this.isGroupedNumber(groups);
      normalized = isGrouping
        ? groups.join('')
        : `${groups.slice(0, -1).join('')}.${groups[groups.length - 1]}`;
    } else {
      normalized = unsigned;
    }

    const amount = Number(normalized) * sign;
    return Number.isFinite(amount) && amount !== 0 ? Math.abs(amount) : null;
  }

  private isGroupedNumber(groups: string[]): boolean {
    return (
      groups.length > 1 &&
      groups[0].length >= 1 &&
      groups[0].length <= 3 &&
      groups[groups.length - 1].length === 3 &&
      groups.slice(1).every(group => group.length >= 2 && group.length <= 3)
    );
  }

  private normalizeCurrencyCode(raw?: string): string | undefined {
    if (!raw) return undefined;
    const normalized = raw.trim().toUpperCase().replace(/\s/g, '').replace(/\.$/, '');
    const aliases: Record<string, string> = {
      'US$': 'USD',
      'A$': 'AUD',
      'AU$': 'AUD',
      'CA$': 'CAD',
      'NZ$': 'NZD',
      'HK$': 'HKD',
      'SG$': 'SGD',
      'R$': 'BRL',
      '₹': 'INR',
      '€': 'EUR',
      '₦': 'NGN',
      '₱': 'PHP',
      '฿': 'THB',
      '₺': 'TRY',
      '₴': 'UAH',
      '₽': 'RUB',
      '₫': 'VND',
      '₸': 'KZT',
      '₲': 'PYG',
      '₵': 'GHS',
      '৳': 'BDT',
      '₪': 'ILS',
      '₡': 'CRC',
      '₭': 'LAK',
      '₮': 'MNT',
    };

    if (aliases[normalized]) return aliases[normalized];
    if (/^[A-Z]{3}$/.test(raw.trim()) && currencyCodes.includes(normalized)) return normalized;

    const matchingCodes = COMMON_CURRENCIES.filter(currency => currency.symbol === raw.trim()).map(
      currency => currency.code,
    );
    if (matchingCodes.length === 1) return matchingCodes[0];

    // Generic symbols such as $, £, ¥, and Rs identify multiple currencies.
    // Preserve the amount, but leave currency unresolved for user review.
    return undefined;
  }
}
