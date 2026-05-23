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
    const text = input.rawText.toLowerCase().trim();

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
    const isExpense = !['received', 'deposited', 'salary', 'income', 'refund'].some(keyword =>
      descriptiveText.includes(keyword),
    );
    const direction = isExpense ? 'debit' : 'credit';

    // 3. Extract Hints using Preposition Anchor Boundaries
    let sourceHint: string | undefined;
    let targetHint: string | undefined;

    const fromIndex = descriptiveText.indexOf(' from ');
    const usingIndex = descriptiveText.indexOf(' using ');
    const viaIndex = descriptiveText.indexOf(' via ');
    const forIndex = descriptiveText.indexOf(' for ');
    const onIndex = descriptiveText.indexOf(' on ');
    const toIndex = descriptiveText.indexOf(' to ');

    // Identify where the source account starts
    const sourceIndex = Math.max(fromIndex, usingIndex, viaIndex);

    if (sourceIndex !== -1) {
      let sourceMarkerLength = 0;
      if (sourceIndex === fromIndex) sourceMarkerLength = 6;
      else if (sourceIndex === usingIndex) sourceMarkerLength = 7;
      else if (sourceIndex === viaIndex) sourceMarkerLength = 5;

      sourceHint = descriptiveText.substring(sourceIndex + sourceMarkerLength).trim();

      // The target is between the category marker and source marker
      const targetMarkerIndex = Math.max(forIndex, onIndex, toIndex);
      if (targetMarkerIndex !== -1 && targetMarkerIndex < sourceIndex) {
        let markerLength = 0;
        if (targetMarkerIndex === forIndex) markerLength = 5;
        else if (targetMarkerIndex === onIndex) markerLength = 4;
        else if (targetMarkerIndex === toIndex) markerLength = 4;

        targetHint = descriptiveText
          .substring(targetMarkerIndex + markerLength, sourceIndex)
          .trim();
      } else {
        targetHint = descriptiveText.substring(0, sourceIndex).trim();
      }
    } else {
      // No source marker found, check if there is a category marker
      const targetMarkerIndex = Math.max(forIndex, onIndex, toIndex);
      if (targetMarkerIndex !== -1) {
        let markerLength = 0;
        if (targetMarkerIndex === forIndex) markerLength = 5;
        else if (targetMarkerIndex === onIndex) markerLength = 4;
        else if (targetMarkerIndex === toIndex) markerLength = 4;

        targetHint = descriptiveText.substring(targetMarkerIndex + markerLength).trim();
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
      currencyCode,
      direction,
      sourceAccountHint: sourceHint || undefined,
      destinationCategoryHint: targetHint || undefined,
      merchantName: targetHint || undefined,
      date: input.date,
    };
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
