import { analytics } from '@/src/services/analytics';
import { resolveAccount } from '@/src/services/ledger/resolution';
import { workplaceService } from '@/src/services/WorkplaceService';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import { ingestTransaction } from '../TransactionIngestionService';

jest.mock('@/src/services/analytics', () => ({
  analytics: { logAiIngestion: jest.fn() },
}));
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: { getCurrency: jest.fn() },
}));
jest.mock('@/src/services/ledger/resolution', () => ({ resolveAccount: jest.fn() }));

const workplaceId = asWorkplaceId('workplace-1');
const sourceAccountId = asAccountId('cash');
const categoryAccountId = asAccountId('food');
const resolve = jest.mocked(resolveAccount);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(workplaceService.getCurrency).mockResolvedValue('INR');
  resolve.mockResolvedValue({
    sourceAccountId,
    categoryAccountId,
    sourceAccountName: 'Cash',
    categoryAccountName: 'Food',
    confidence: 0.95,
    strategyUsed: 'fuzzy',
  });
});

describe('voice transaction ingestion', () => {
  it('leaves missing amounts for confirmation without resolving accounts', async () => {
    const output = await ingestTransaction('coffee using cash', workplaceId);

    expect(output).toMatchObject({
      transactions: [
        {
          amount: undefined,
          currencyCode: 'INR',
          accountNameHint: 'cash',
          categoryNameHint: 'coffee',
        },
      ],
      confidenceScore: 0.1,
      isHighConfidence: false,
      provider: 'deterministic',
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(analytics.logAiIngestion).toHaveBeenCalledWith('amount_missing');
  });

  it.each([
    [0.89, false],
    [0.9, true],
  ])('preserves account suggestions and confidence at %s', async (confidence, highConfidence) => {
    resolve.mockResolvedValue({
      sourceAccountId,
      categoryAccountId,
      sourceAccountName: 'Cash',
      categoryAccountName: 'Food',
      confidence,
      strategyUsed: 'fuzzy',
    });

    const output = await ingestTransaction('spent 25 rs for coffee using cash', workplaceId);

    expect(output).toMatchObject({
      transactions: [
        {
          amount: 25,
          currencyCode: 'INR',
          accountId: sourceAccountId,
          categoryId: categoryAccountId,
          accountNameHint: 'Cash',
          categoryNameHint: 'Food',
        },
      ],
      confidenceScore: confidence,
      isHighConfidence: highConfidence,
      provider: 'deterministic',
    });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({ workplaceId, sourceHint: 'cash', direction: 'debit' }),
    );
  });

  it('treats the old mock trigger as ordinary text instead of fabricating a transaction', async () => {
    resolve.mockResolvedValue({
      sourceAccountId,
      categoryAccountId,
      confidence: 0.4,
      strategyUsed: 'default',
    });

    const output = await ingestTransaction('spent 25 rs mock ai success', workplaceId);

    expect(output.transactions[0].amount).toBe(25);
    expect(output.provider).toBe('deterministic');
    expect(output.isHighConfidence).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('keeps refund direction and semantic tagging', async () => {
    resolve.mockResolvedValue({
      sourceAccountId,
      categoryAccountId,
      confidence: 0.95,
      strategyUsed: 'fuzzy',
      semanticType: 'REFUND',
    });

    const output = await ingestTransaction('received 50 rs refund using cash', workplaceId);

    expect(output.transactions[0]).toMatchObject({
      amount: 50,
      type: 'income',
      isReversal: true,
      semanticTag: 'REFUND',
    });
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ isReversal: true }));
    expect(analytics.logAiIngestion).toHaveBeenCalledWith('reversal_detected');
  });

  it('surfaces account-resolution failures to the existing confirmation UI', async () => {
    const failure = new Error('Account lookup failed');
    resolve.mockRejectedValue(failure);

    await expect(ingestTransaction('spent 25 rs for coffee', workplaceId)).rejects.toBe(failure);
  });
});
