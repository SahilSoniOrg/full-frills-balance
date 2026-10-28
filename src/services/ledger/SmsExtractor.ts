import { ExtractedInfo, RawTransactionInput, TransactionExtractor } from './TransactionExtractor';
import { extractSmsReference } from '@/src/utils/sms/SmsReferenceExtractor';
import { SMS_CURRENCY_SYMBOLS_PATTERN } from '@/src/utils/sms/smsCurrencyPattern';

export class SmsExtractor implements TransactionExtractor {
  canExtract(input: RawTransactionInput): boolean {
    return input.channel === 'sms';
  }

  async extract(input: RawTransactionInput): Promise<ExtractedInfo> {
    const text = input.rawText.toLowerCase();

    const direction = this.classifyDirection(text);
    const currencyMatch = this.extractCurrencyAndAmount(input.rawText);
    const merchant = this.extractMerchant(input.rawText, direction);
    const accountSource = this.extractAccountSource(input.rawText);
    const reference = extractSmsReference(input.rawText);

    return {
      amount: currencyMatch?.amount,
      currencyCode: currencyMatch?.currencyCode || undefined,
      direction,
      referenceNumber: reference?.value,
      sourceAccountHint: accountSource,
      destinationCategoryHint: merchant,
      merchantName: merchant,
      date: input.date,
    };
  }

  private classifyDirection(text: string): 'debit' | 'credit' | 'unknown' {
    // Mask "credit card" to prevent treating the card type as a credit transaction
    const sanitized = text.replace(/credit\s*card/gi, 'cc_token');

    // Debit keywords across English, Spanish/Portuguese, Swahili, Indonesian, etc.
    const isDebit =
      /\b(?:debit(?:ed)?|dr|spent|paid|purchase|withdrawn|withdrawal|charge[ds]?|sent|transfer(?:red)?|payment|paybill|buy\s+goods|cashed\s+out|enviado|compra|saque|pagaste|debitado|umelipa|umetuma|imetolewa|qris|berhasil|bayar)\b/i.test(
        sanitized,
      ) || text.includes('txn');

    // Credit keywords across English, Spanish/Portuguese, Swahili, Indonesian, etc.
    const isCredit =
      /\b(?:credit(?:ed)?|cr|received|deposited|refund(?:ed)?|reversed|reversal|inward|cashback|salary|recebido|recebeu|recibida|creditado|umepokea|imepokea|dikredit)\b/i.test(
        sanitized,
      );

    if (isDebit && !isCredit) return 'debit';
    if (isCredit && !isDebit) return 'credit';
    if (isCredit && isDebit) {
      // In mixed messages, explicit credit indicators like "received" or "refund" take precedence
      if (
        /\b(?:received|refund|reversed|reversal|cashback|salary|recebido|umepokea)\b/i.test(
          sanitized,
        )
      ) {
        return 'credit';
      }
      return 'debit';
    }
    return 'unknown';
  }

  private extractCurrencyAndAmount(
    body: string,
  ): { amount: number; currencyCode: string | null } | null {
    const patterns: { regex: RegExp; currencyGroup?: number; amountGroup: number }[] = [
      {
        regex: new RegExp(
          `(?:amt|amount|txn(?: of)?|debited(?: by)?|credited(?: with)?|spent|paid|received|deposited|transferred|transfer(?: of)?|charge[ds]?|purchase(?: of)?|sent|payment(?: of| made for)?|withdrawn|withdrawal(?: of)?|enviado|recebido|compra(?: de)?|saque(?: de)?|umelipa|umetuma|umepokea|imetolewa|sebesar)[^\\dA-Z₹$€£¥₦GH₵₱฿₫Đ৳E£]*(${SMS_CURRENCY_SYMBOLS_PATTERN})?\\s*([\\d,.]+(?:[\\.,]\\d+)?)\\b`,
          'i',
        ),
        currencyGroup: 1,
        amountGroup: 2,
      },
      {
        regex: new RegExp(`(${SMS_CURRENCY_SYMBOLS_PATTERN})\\s*([\\d,.]+(?:[\\.,]\\d+)?)\\b`, 'i'),
        currencyGroup: 1,
        amountGroup: 2,
      },
      {
        regex: new RegExp(`([\\d,.]+(?:[\\.,]\\d+)?)\\s*(${SMS_CURRENCY_SYMBOLS_PATTERN})\\b`, 'i'),
        currencyGroup: 2,
        amountGroup: 1,
      },
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern.regex);
      if (!match) continue;
      const currencyRaw = pattern.currencyGroup ? match[pattern.currencyGroup] : undefined;
      const amount = this.normalizeAmount(match[pattern.amountGroup], currencyRaw);
      if (!amount || amount <= 0) continue;
      const currencyCode = this.normalizeCurrencyCode(currencyRaw);
      return { amount, currencyCode };
    }

    return null;
  }

  private extractMerchant(
    body: string,
    direction: 'debit' | 'credit' | 'unknown',
  ): string | undefined {
    // Specific location/merchant prepositions take precedence over ambiguous prepositions like "to"
    const patterns =
      direction === 'credit'
        ? [
            /(?:from|by|kutoka|de|dari)\s+([a-zA-Z0-9.\s@&'-]+?)(?:\s*[(,.]|\s+(?:on|ref|utr|txn|bal|no\.?|date|avbl)|$)/i,
          ]
        : [
            // Venue / Merchant location keywords (at, @, vpa, di)
            /(?:at|@|vpa|di)\s+([a-zA-Z0-9.\s@&'-]+?)(?:\s*[(,.]|\s+(?:on|ref|utr|by|bal|no\.?|date|using|avbl|pada)|$)/i,
            // Generic recipient keywords (to, kwa, para, ke)
            /(?:to|info[:]?|kwa|para|ke)\s+([a-zA-Z0-9.\s@&'-]+?)(?:\s*[(,.]|\s+(?:on|ref|utr|by|bal|no\.?|date|using|avbl|pada)|$)/i,
          ];

    for (const regex of patterns) {
      const match = body.match(regex);
      const value = match?.[1]?.trim();
      if (value && value.length > 1) {
        // Discard matches that are actually account/card references
        if (/^(?:card|account|a\/c|acc)\b/i.test(value)) {
          continue;
        }
        return value.replace(/\s+/g, ' ');
      }
    }

    return undefined;
  }

  private extractAccountSource(body: string): string | undefined {
    // Matches prefixes like "a/c", "card ending", "conta ****1234", "akaunti 0150****123"
    const sourceRegex =
      /(?:a\/c|acct|acc|account|conta|akaunti|rek|rekening|card|cartao)\s*(?:no\.?|ending|final)?\s*[:\-]?\s*(?:(?:\d*[*xX.-]+)(\d{3,6})|(\d{3,6}))|by\s+(UPI)|([xX*.]{2,}[\s\-]?\d{3,6})/i;
    const match = body.match(sourceRegex);
    if (!match) return undefined;

    const matchedDigits = match[1] || match[2];
    if (matchedDigits) {
      const isCard = /card|cartao/i.test(match[0]);
      return `${isCard ? 'Card' : 'A/c'} ${matchedDigits}`;
    }
    if (match[3]) return 'UPI';
    if (match[4]) return `A/c ${match[4].replace(/[^0-9]/g, '')}`;
    return undefined;
  }

  private normalizeAmount(raw: string, currencyRaw?: string): number | null {
    let clean = raw.trim().replace(/\.+$/, '');
    const isZeroDecimalCurrency =
      currencyRaw && /^(?:IDR|RP|VND|₫|Đ|JPY|¥|KRW|₩)\b/i.test(currencyRaw.trim());

    // Format: 1.234,56 (thousands dot, decimal comma)
    if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(clean)) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    }
    // Format: 150,00 or 89,90 (single comma decimal with 1 or 2 digits)
    else if (/^\d+,\d{1,2}$/.test(clean)) {
      clean = clean.replace(',', '.');
    }
    // Format: 75.000 or 1.500.000 for zero-decimal currencies like IDR / VND
    else if (isZeroDecimalCurrency && /^\d{1,3}(?:\.\d{3})+$/.test(clean)) {
      clean = clean.replace(/\./g, '');
    }
    // Standard format: 1,234.56 or 1250 or 20.60
    else {
      clean = clean.replace(/,/g, '');
    }
    const amount = parseFloat(clean);
    return Number.isFinite(amount) ? amount : null;
  }

  private normalizeCurrencyCode(raw?: string): string | null {
    if (!raw) return null;
    const normalized = raw.trim().toUpperCase();
    const symbolMap: Record<string, string> = {
      // Africa
      KSH: 'KES',
      KSHS: 'KES',
      '₦': 'NGN',
      NGN: 'NGN',
      'GH₵': 'GHS',
      GHC: 'GHS',
      GHS: 'GHS',
      R: 'ZAR',
      ZAR: 'ZAR',
      USH: 'UGX',
      USHS: 'UGX',
      UGX: 'UGX',
      TSH: 'TZS',
      TSHS: 'TZS',
      TZS: 'TZS',
      EGP: 'EGP',
      LE: 'EGP',
      'L.E.': 'EGP',
      'E£': 'EGP',
      MAD: 'MAD',

      // Asia-Pacific
      '₹': 'INR',
      RS: 'INR',
      'RS.': 'INR',
      INR: 'INR',
      PKR: 'PKR',
      BDT: 'BDT',
      TK: 'BDT',
      'TK.': 'BDT',
      '৳': 'BDT',
      LKR: 'LKR',
      NPR: 'NPR',
      '₱': 'PHP',
      PHP: 'PHP',
      'PHP.': 'PHP',
      RP: 'IDR',
      'RP.': 'IDR',
      IDR: 'IDR',
      RM: 'MYR',
      MYR: 'MYR',
      THB: 'THB',
      '฿': 'THB',
      VND: 'VND',
      '₫': 'VND',
      Đ: 'VND',
      S$: 'SGD',
      SGD: 'SGD',
      '¥': 'JPY',
      JPY: 'JPY',
      CNY: 'CNY',
      HKD: 'HKD',
      HK$: 'HKD',
      NZ$: 'NZD',
      NZD: 'NZD',
      A$: 'AUD',
      AUD: 'AUD',

      // Middle East
      AED: 'AED',
      DHS: 'AED',
      'DHS.': 'AED',
      DH: 'AED',
      SAR: 'SAR',
      SR: 'SAR',
      QAR: 'QAR',
      QR: 'QAR',
      KWD: 'KWD',
      KD: 'KWD',
      BHD: 'BHD',
      OMR: 'OMR',
      JOD: 'JOD',

      // Americas & Europe
      $: 'USD',
      US$: 'USD',
      USD: 'USD',
      C$: 'CAD',
      CAD: 'CAD',
      '€': 'EUR',
      EUR: 'EUR',
      '£': 'GBP',
      GBP: 'GBP',
      CHF: 'CHF',
      BRL: 'BRL',
      R$: 'BRL',
      MXN: 'MXN',
      MEX$: 'MXN',
      COP: 'COP',
      COL$: 'COP',
    };

    return symbolMap[normalized] || normalized.replace(/\./g, '');
  }
}
