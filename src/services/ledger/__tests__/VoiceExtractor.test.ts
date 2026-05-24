import { VoiceExtractor } from '../VoiceExtractor';

describe('VoiceExtractor', () => {
  let extractor: VoiceExtractor;

  beforeEach(() => {
    extractor = new VoiceExtractor();
  });

  it('canExtract returns true for voice channel', () => {
    expect(
      extractor.canExtract({
        channel: 'voice',
        id: 'voice-1',
        rawText: 'hello',
        date: 1000,
      }),
    ).toBe(true);

    expect(
      extractor.canExtract({
        channel: 'sms',
        id: 'sms-1',
        rawText: 'hello',
        date: 1000,
      }),
    ).toBe(false);
  });

  it('extracts simple amount and currency', async () => {
    const result = await extractor.extract({
      channel: 'voice',
      id: 'voice-1',
      rawText: 'spent 150.50 rupees on dinner',
      date: 1000,
    });

    expect(result.amount).toBe(150.5);
    expect(result.currencyCode).toBe('INR');
    expect(result.direction).toBe('debit');
    expect(result.destinationCategoryHint).toBe('dinner');
  });

  it('extracts source and category using prepositions', async () => {
    const result = await extractor.extract({
      channel: 'voice',
      id: 'voice-2',
      rawText: 'spent 500 dollars for groceries from hdfc',
      date: 1000,
    });

    expect(result.amount).toBe(500);
    expect(result.currencyCode).toBe('USD');
    expect(result.direction).toBe('debit');
    expect(result.sourceAccountHint).toBe('hdfc');
    expect(result.destinationCategoryHint).toBe('groceries');
  });

  it('extracts credit direction correctly', async () => {
    const result = await extractor.extract({
      channel: 'voice',
      id: 'voice-3',
      rawText: 'received 1000 rs from mom',
      date: 1000,
    });

    expect(result.amount).toBe(1000);
    expect(result.currencyCode).toBe('INR');
    expect(result.direction).toBe('credit');
    expect(result.sourceAccountHint).toBe('mom');
  });

  it('correctly handles multiple prepositions in the sentence (bug regression)', async () => {
    // Test case with "from" and "via"
    const result1 = await extractor.extract({
      channel: 'voice',
      id: 'voice-4',
      rawText: 'received 1200 rupees from dad via upi',
      date: 1000,
    });

    expect(result1.direction).toBe('credit');
    expect(result1.sourceAccountHint).toBe('upi'); // last winning preposition "via"
    expect(result1.destinationCategoryHint).toBe('received from dad'); // target text is everything before "via upi"

    // Test case with "for" and "on"
    const result2 = await extractor.extract({
      channel: 'voice',
      id: 'voice-5',
      rawText: 'spent 50 for coffee on card',
      date: 1000,
    });

    expect(result2.direction).toBe('debit');
    expect(result2.sourceAccountHint).toBeUndefined(); // no source preposition found
    expect(result2.destinationCategoryHint).toBe('card'); // last target preposition is "on", so everything after it
  });

  it('normalizes lakh and crore', async () => {
    const resultLakh = await extractor.extract({
      channel: 'voice',
      id: 'voice-lakh',
      rawText: 'received 1 lakh from bank',
      date: 1000,
    });
    expect(resultLakh.amount).toBe(100000);

    const resultCrore = await extractor.extract({
      channel: 'voice',
      id: 'voice-crore',
      rawText: 'spent 2 crores on mansion',
      date: 1000,
    });
    expect(resultCrore.amount).toBe(20000000);
  });

  it('detects reversals', async () => {
    const resultRefund = await extractor.extract({
      channel: 'voice',
      id: 'voice-refund',
      rawText: 'refund 500 from amazon',
      date: 1000,
    });
    expect(resultRefund.isReversal).toBe(true);
    expect(resultRefund.direction).toBe('credit');

    const resultCashback = await extractor.extract({
      channel: 'voice',
      id: 'voice-cashback',
      rawText: 'got 50 cashback',
      date: 1000,
    });
    expect(resultCashback.isReversal).toBe(true);
    expect(resultCashback.direction).toBe('credit');
  });

  it('uses default currency from metadata if missing in text', async () => {
    const result = await extractor.extract({
      channel: 'voice',
      id: 'voice-no-currency',
      rawText: 'spent 200 on banana',
      date: 1000,
      metadata: { defaultCurrencyCode: 'USD' },
    });
    expect(result.amount).toBe(200);
    expect(result.currencyCode).toBe('USD');
  });
});
