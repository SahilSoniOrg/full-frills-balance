import {
  ExtractedInfo,
  RawTransactionInput,
  TransactionExtractor,
  transactionExtractorRegistry,
} from './TransactionExtractor';

export class SmsExtractor implements TransactionExtractor {
  canExtract(input: RawTransactionInput): boolean {
    return input.channel === 'sms';
  }

  async extract(input: RawTransactionInput): Promise<ExtractedInfo> {
    const text = input.rawText.toLowerCase();
    const isPhoneNumber = /^\+?\d{10,14}$/.test(input.senderAddress || '');

    if (isPhoneNumber) {
      return {
        direction: 'unknown',
        date: input.date,
      };
    }

    const direction = this.classifyDirection(text);
    const currencyMatch = this.extractCurrencyAndAmount(input.rawText);
    const merchant = this.extractMerchant(input.rawText, direction);
    const accountSource = this.extractAccountSource(input.rawText);
    const referenceNumber = this.extractReferenceNumber(input.rawText);

    return {
      amount: currencyMatch?.amount,
      currencyCode: currencyMatch?.currencyCode || undefined,
      direction,
      referenceNumber,
      sourceAccountHint: accountSource,
      destinationCategoryHint: merchant,
      merchantName: merchant,
      date: input.date,
    };
  }

  private classifyDirection(text: string): 'debit' | 'credit' | 'unknown' {
    const isDebit = ['debited', 'spent', 'paid', 'purchase', 'withdrawn', 'txn'].some(keyword =>
      text.includes(keyword),
    );
    const isCredit = ['credited', 'received', 'deposited', 'refund', 'reversed'].some(keyword =>
      text.includes(keyword),
    );

    if (isDebit && !isCredit) return 'debit';
    if (isCredit && !isDebit) return 'credit';
    if (isDebit) return 'debit';
    return 'unknown';
  }

  private extractCurrencyAndAmount(
    body: string,
  ): { amount: number; currencyCode: string | null } | null {
    const patterns: { regex: RegExp; currencyGroup?: number; amountGroup: number }[] = [
      {
        regex:
          /(?:amt|amount|txn(?: of)?|debited(?: by)?|credited(?: with)?|spent|paid|received|deposited)[^\dA-Z₹$€£¥]*((?:INR|USD|EUR|GBP|AED|SAR|CAD|AUD|SGD|JPY|CHF|HKD|CNY|₹|Rs\.?|INR\.?|US\$|A\$|C\$|\$|€|£|¥)?)\s*([\d,.]+(?:\.\d+)?)/i,
        currencyGroup: 1,
        amountGroup: 2,
      },
      {
        regex:
          /((?:INR|USD|EUR|GBP|AED|SAR|CAD|AUD|SGD|JPY|CHF|HKD|CNY|₹|Rs\.?|INR\.?|US\$|A\$|C\$|\$|€|£|¥))\s*([\d,.]+(?:\.\d+)?)/i,
        currencyGroup: 1,
        amountGroup: 2,
      },
      {
        regex: /([\d,.]+(?:\.\d+)?)\s*((?:INR|USD|EUR|GBP|AED|SAR|CAD|AUD|SGD|JPY|CHF|HKD|CNY))/i,
        currencyGroup: 2,
        amountGroup: 1,
      },
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern.regex);
      if (!match) continue;
      const amount = this.normalizeAmount(match[pattern.amountGroup]);
      if (!amount || amount <= 0) continue;
      const currencyCode = this.normalizeCurrencyCode(
        pattern.currencyGroup ? match[pattern.currencyGroup] : undefined,
      );
      return { amount, currencyCode };
    }

    return null;
  }

  private extractMerchant(
    body: string,
    direction: 'debit' | 'credit' | 'unknown',
  ): string | undefined {
    const patterns =
      direction === 'credit'
        ? [/(?:from|by)\s+([a-zA-Z0-9.\s@&-]+?)(?:\s+(?:on|ref|utr|txn|bal)|[,.]|$)/i]
        : [/(?:to|at|vpa|info[:]?)\s+([a-zA-Z0-9.\s@&-]+?)(?:\s+(?:on|ref|utr|by|bal)|[,.]|$)/i];

    for (const regex of patterns) {
      const match = body.match(regex);
      const value = match?.[1]?.trim();
      if (value && value.length > 1) {
        return value.replace(/\s+/g, ' ');
      }
    }

    return undefined;
  }

  private extractAccountSource(body: string): string | undefined {
    const sourceRegex =
      /(?:a\/c|acct|acc|card)\s*[:\-]?\s*[*xX.-]*(\d{3,6})|by\s+(UPI)|([xX*.]{2,}[\s\-]?\d{3,6})/i;
    const match = body.match(sourceRegex);
    if (!match) return undefined;
    if (match[1]) {
      const prefixMatch = body.match(/card/i);
      return `${prefixMatch ? 'Card' : 'A/c'} ${match[1]}`;
    }
    if (match[2]) return 'UPI';
    if (match[3]) return `A/c ${match[3].replace(/[^0-9]/g, '')}`;
    return undefined;
  }

  private extractReferenceNumber(body: string): string | undefined {
    const match = body.match(
      /(?:utr|ref(?:\s*no)?|txn\s*id|transaction\s*id|rrn|cheque(?:\s*no)?)\s*[:\-]?\s*([a-zA-Z0-9]{6,30})/i,
    );
    return match?.[1];
  }

  private normalizeAmount(raw: string): number | null {
    const normalized = raw.replace(/,/g, '');
    const amount = parseFloat(normalized);
    return Number.isFinite(amount) ? amount : null;
  }

  private normalizeCurrencyCode(raw?: string): string | null {
    if (!raw) return null;
    const normalized = raw.trim().toUpperCase();
    const symbolMap: Record<string, string> = {
      '₹': 'INR',
      RS: 'INR',
      'RS.': 'INR',
      $: 'USD',
      US$: 'USD',
      A$: 'AUD',
      C$: 'CAD',
      '€': 'EUR',
      '£': 'GBP',
      '¥': 'JPY',
    };

    return symbolMap[normalized] || normalized.replace(/\./g, '');
  }
}

// Register SMS Extractor
transactionExtractorRegistry.register(new SmsExtractor());
