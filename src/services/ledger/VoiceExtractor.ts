import {
  ExtractedInfo,
  RawTransactionInput,
  TransactionExtractor,
  transactionExtractorRegistry,
} from './TransactionExtractor';

export class VoiceExtractor implements TransactionExtractor {
  canExtract(input: RawTransactionInput): boolean {
    return input.channel === 'voice';
  }

  async extract(input: RawTransactionInput): Promise<ExtractedInfo> {
    let text = input.rawText.toLowerCase().trim();

    // 0. Pre-process for local currency terms (lakh, crore)
    text = text.replace(/(\d+)\s*lakh(s)?/g, (_, n) => (parseInt(n) * 100000).toString());
    text = text.replace(/(\d+)\s*crore(s)?/g, (_, n) => (parseInt(n) * 10000000).toString());

    // 1. Extract Amount and Currency
    let amount: number | undefined;
    let currencyCode: string | undefined;

    // Matches expressions like "100 rs", "100.50 rupees", "150.75 usd", "50 $", etc.
    const amountRegex = /([\d,]+(?:\.\d+)?)\s*(rs|rupees|usd|dollars|inr|\$|€|eur|pounds)/i;
    const amountMatch = text.match(amountRegex);

    if (amountMatch) {
      amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      const rawCurrency = amountMatch[2];
      currencyCode = this.normalizeCurrencyCode(rawCurrency) || undefined;
    } else {
      // Look for a standalone number as a fallback amount
      const fallbackRegex = /\b([\d,]+(?:\.\d+)?)\b/;
      const fallbackMatch = text.match(fallbackRegex);
      if (fallbackMatch) {
        amount = parseFloat(fallbackMatch[1].replace(/,/g, ''));
      }
    }

    // Clean the text by removing the amount and currency expressions to isolate hints
    let descriptiveText = text.replace(amountRegex, '').replace(/\s+/g, ' ').trim();
    if (amount) {
      descriptiveText = descriptiveText
        .replace(new RegExp(`\\b${amount}\\b`, 'g'), '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // 2. Classify Direction (Expense vs. Income)
    const reversalVerbs = ['refund', 'cashback', 'chargeback', 'reversal', 'cancel', 'reverse'];
    const isReversal = reversalVerbs.some(verb => text.includes(verb));

    const isExpense = !['received', 'deposited', 'salary', 'income', ...reversalVerbs].some(
      keyword => descriptiveText.includes(keyword),
    );
    const direction = isExpense ? 'debit' : 'credit';

    // 3. Extract Hints using Preposition Anchor Boundaries
    let sourceHint: string | undefined;
    let targetHint: string | undefined;

    const fromMatch = this.findPrepositionIndex(descriptiveText, 'from');
    const usingMatch = this.findPrepositionIndex(descriptiveText, 'using');
    const viaMatch = this.findPrepositionIndex(descriptiveText, 'via');

    let sourceMatch = { index: -1, length: 0 };
    if (fromMatch.index !== -1) sourceMatch = fromMatch;
    if (usingMatch.index !== -1 && usingMatch.index > sourceMatch.index) sourceMatch = usingMatch;
    if (viaMatch.index !== -1 && viaMatch.index > sourceMatch.index) sourceMatch = viaMatch;

    if (sourceMatch.index !== -1) {
      sourceHint = descriptiveText.substring(sourceMatch.index + sourceMatch.length).trim();

      const forMatch = this.findPrepositionIndex(descriptiveText, 'for');
      const onMatch = this.findPrepositionIndex(descriptiveText, 'on');
      const toMatch = this.findPrepositionIndex(descriptiveText, 'to');

      let targetMatch = { index: -1, length: 0 };
      if (forMatch.index !== -1 && forMatch.index < sourceMatch.index) targetMatch = forMatch;
      if (
        onMatch.index !== -1 &&
        onMatch.index < sourceMatch.index &&
        onMatch.index > targetMatch.index
      )
        targetMatch = onMatch;
      if (
        toMatch.index !== -1 &&
        toMatch.index < sourceMatch.index &&
        toMatch.index > targetMatch.index
      )
        targetMatch = toMatch;

      if (targetMatch.index !== -1) {
        targetHint = descriptiveText
          .substring(targetMatch.index + targetMatch.length, sourceMatch.index)
          .trim();
      } else {
        targetHint = descriptiveText.substring(0, sourceMatch.index).trim();
      }
    } else {
      // No source marker found, check if there is a category marker
      const forMatch = this.findPrepositionIndex(descriptiveText, 'for');
      const onMatch = this.findPrepositionIndex(descriptiveText, 'on');
      const toMatch = this.findPrepositionIndex(descriptiveText, 'to');

      let targetMatch = { index: -1, length: 0 };
      if (forMatch.index !== -1) targetMatch = forMatch;
      if (onMatch.index !== -1 && onMatch.index > targetMatch.index) targetMatch = onMatch;
      if (toMatch.index !== -1 && toMatch.index > targetMatch.index) targetMatch = toMatch;

      if (targetMatch.index !== -1) {
        targetHint = descriptiveText.substring(targetMatch.index + targetMatch.length).trim();
      } else {
        targetHint = descriptiveText;
      }
    }

    // Clean leading punctuation or noise words
    sourceHint = sourceHint
      ?.replace(/^(the|my|account|card)\s+/g, '')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
      .trim();
    targetHint = targetHint
      ?.replace(/^(the|some|a|an)\s+/g, '')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
      .trim();

    return {
      amount: amount && amount > 0 ? amount : undefined,
      currencyCode: currencyCode || (input.metadata?.defaultCurrencyCode as string),
      direction,
      sourceAccountHint: sourceHint || undefined,
      destinationCategoryHint: targetHint || undefined,
      merchantName: targetHint || undefined,
      date: input.date,
      isReversal,
      channel: 'voice',
    };
  }

  private findPrepositionIndex(text: string, prep: string): { index: number; length: number } {
    const regex = new RegExp(`\\b${prep}\\b`, 'i');
    const match = text.match(regex);
    if (match && match.index !== undefined) {
      return { index: match.index, length: match[0].length };
    }
    return { index: -1, length: 0 };
  }

  private normalizeCurrencyCode(raw: string): string | null {
    const symbolMap: Record<string, string> = {
      '₹': 'INR',
      rs: 'INR',
      rupees: 'INR',
      $: 'USD',
      dollars: 'USD',
      '€': 'EUR',
      eur: 'EUR',
      '£': 'GBP',
      pounds: 'GBP',
    };
    return symbolMap[raw.toLowerCase()] || raw.toUpperCase();
  }
}

// Register Voice Extractor
transactionExtractorRegistry.register(new VoiceExtractor());
