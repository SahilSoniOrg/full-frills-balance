import { AIContext } from '../types/ai-parsing';
import { TypeSafeTransactionFallbackAIProvider } from '../TypeSafeTransactionFallbackAIProvider';
import { logger } from '@/src/utils/logger';

const context: AIContext = {
  accounts: [
    { id: 'checking-id', name: 'Checking' },
    { id: 'credit-card-id', name: 'Credit Card' },
  ],
  categories: [
    { id: 'food-id', name: 'Food' },
    { id: 'transport-id', name: 'Transport' },
  ],
  parserHints: {
    amount: 500,
    rawAccount: 'checking',
    rawItem: 'dinner',
    direction: 'debit',
  },
};

function typeSafeResponse(overrides: Record<string, { choice: string; confidence: number }> = {}) {
  const answers = {
    transaction_type: { type: 'choice', choice: 'expense', confidence: 0.96 },
    source_account: { type: 'choice', choice: 'checking-id', confidence: 0.94 },
    category: { type: 'choice', choice: 'food-id', confidence: 0.91 },
    semantic_tag: { type: 'choice', choice: 'none', confidence: 0.99 },
    ...Object.fromEntries(
      Object.entries(overrides).map(([key, value]) => [key, { type: 'choice', ...value }]),
    ),
  };
  return new Response(JSON.stringify({ answers }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('TypeSafeTransactionFallbackAIProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the backend contract and maps typed answers into the ingestion contract', async () => {
    const debugSpy = jest.spyOn(logger, 'debug');
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        typeSafeResponse({ semantic_tag: { choice: 'cashback', confidence: 0.88 } }),
      );
    const provider = new TypeSafeTransactionFallbackAIProvider(
      () => 'http://backend.test',
      (...args) => fetch(...args),
    );

    await expect(
      provider.parse('spent 500 rupees on dinner from checking', context),
    ).resolves.toEqual({
      transactions: [
        {
          type: 'expense',
          amount: 500,
          accountId: 'checking-id',
          categoryId: 'food-id',
          accountNameHint: 'Checking',
          categoryNameHint: 'Food',
          description: 'dinner',
          isReversal: false,
          semanticTag: 'cashback',
        },
      ],
      confidenceScore: 0.88,
      isHighConfidence: false,
      provider: 'typesafe',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, request] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://backend.test/typesafe/transaction');
    expect(request?.method).toBe('POST');
    expect(request?.headers).toEqual({ 'content-type': 'application/json' });

    const body = JSON.parse(String(request?.body)) as {
      transcript: string;
      parserHints: AIContext['parserHints'];
      sourceAccounts: { id: string; name: string }[];
      categories: { id: string; name: string }[];
    };
    expect(body).toEqual({
      transcript: 'spent 500 rupees on dinner from checking',
      parserHints: context.parserHints,
      sourceAccounts: [
        { id: 'checking-id', name: 'Checking' },
        { id: 'credit-card-id', name: 'Credit Card' },
      ],
      categories: [
        { id: 'food-id', name: 'Food' },
        { id: 'transport-id', name: 'Transport' },
      ],
    });
    expect(debugSpy).toHaveBeenCalledWith(
      '[TypeSafe] Request payload',
      expect.objectContaining({ body }),
    );
    expect(debugSpy).toHaveBeenCalledWith(
      '[TypeSafe] Response payload',
      expect.objectContaining({ status: 200, ok: true }),
    );
  });

  it('returns null when no backend is configured or the API fails', async () => {
    const providerWithoutBackend = new TypeSafeTransactionFallbackAIProvider(() => '');
    await expect(providerWithoutBackend.parse('spent 500', context)).resolves.toBeNull();

    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    const provider = new TypeSafeTransactionFallbackAIProvider(() => 'http://backend.test');
    await expect(provider.parse('spent 500', context)).resolves.toBeNull();
  });
});
