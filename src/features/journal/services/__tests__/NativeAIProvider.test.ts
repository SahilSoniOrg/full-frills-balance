import { NativeAIProvider } from '../NativeAIProvider';
import type { LLMEngine, GenerateResult } from '@/src/services/ai/types';
import type { AIContext } from '../../types/ai-parsing';

jest.mock('react-native-litert-lm', () => ({
  ModelRegistry: {
    isCached: jest.fn(),
    getFilePath: jest.fn(),
    resolveModel: jest.fn(),
    deleteFile: jest.fn(),
  },
  createLLM: jest.fn(() => ({
    loadModel: jest.fn(),
    execute: jest.fn(),
    close: jest.fn(),
    getStats: jest.fn(),
    resetConversation: jest.fn(),
  })),
}));

describe('NativeAIProvider', () => {
  let mockEngine: jest.Mocked<LLMEngine>;
  let provider: NativeAIProvider;

  beforeEach(() => {
    mockEngine = {
      generate: jest.fn(),
      dispose: jest.fn().mockResolvedValue(undefined),
      getMemorySummary: jest
        .fn()
        .mockReturnValue({ peakResidentBytes: 1000000, currentResidentBytes: 500000 }),
    };
    provider = new NativeAIProvider(mockEngine);
  });

  describe('parseSinglePass', () => {
    it('successfully parses single-pass compact JSON and synthesizes ParserOutput', async () => {
      const transcript = 'spent 250 rs for coffee at starbucks using hdfc card';
      const context: AIContext = {
        accounts: ['HDFC Card', 'Cash'],
        categories: ['Food & Drinks', 'Travel'],
        parserHints: {
          amount: 250,
          rawAccount: 'hdfc card',
          rawItem: 'coffee',
          direction: 'debit',
        },
      };

      // Mock the engine to return the compact JSON format
      mockEngine.generate.mockResolvedValue({
        text: '[0,0,0]',
        stats: {
          tokensPerSecond: 15,
          timeToFirstTokenMs: 200,
          completionTokens: 12,
          totalDurationMs: 800,
        },
      } as GenerateResult);

      const result = await provider.parse(transcript, context, { mode: 'single' });

      expect(result).not.toBeNull();
      expect(result!.transactions).toHaveLength(1);

      const tx = result!.transactions[0];
      expect(tx.type).toBe('expense');
      expect(tx.amount).toBe(250);
      expect(tx.currencyCode).toBe('INR');
      expect(tx.accountNameHint).toBe('HDFC Card');
      expect(tx.categoryNameHint).toBe('Food & Drinks');
      expect(tx.description).toBe(transcript);
      expect(tx.isReversal).toBe(false);

      expect(result!.confidenceScore).toBe(0.9);
      expect(result!.isHighConfidence).toBe(true);
      expect(result!.provider).toBe('ai');

      // Verify prompt contents sent to LLM
      const lastCallPrompt = mockEngine.generate.mock.calls[0][0];
      expect(lastCallPrompt).toContain(
        'Task: Classify transaction type, source index, and target index',
      );
      expect(lastCallPrompt).toContain('spent 250 rs for coffee at starbucks using hdfc card');
    });

    it('gracefully handles missing or malformed JSON responses', async () => {
      const transcript = 'spent 250 rupees';
      const context: AIContext = {
        accounts: ['Cash'],
        categories: ['Food & Drinks'],
        parserHints: {
          amount: 250,
        },
      };

      mockEngine.generate.mockResolvedValue({
        text: 'Not a JSON object',
      } as GenerateResult);

      const result = await provider.parse(transcript, context, { mode: 'single' });
      expect(result).toBeNull();
    });

    it('falls back to raw hints when src/tgt are unknown', async () => {
      const transcript = 'spent 100 on unknown_thing using unknown_acc';
      const context: AIContext = {
        accounts: ['Cash'],
        categories: ['Food & Drinks'],
        parserHints: {
          amount: 100,
          rawAccount: 'unknown_acc',
          rawItem: 'unknown_thing',
        },
      };

      mockEngine.generate.mockResolvedValue({
        text: '[0,-1,-1]',
      } as GenerateResult);

      const result = await provider.parse(transcript, context, { mode: 'single' });
      expect(result).not.toBeNull();

      const tx = result!.transactions[0];
      expect(tx.accountNameHint).toBe('unknown_acc');
      expect(tx.categoryNameHint).toBe('unknown_thing');
    });

    it('detects reversals automatically in synthesis step', async () => {
      const transcript = 'got 1200 refund from amazon to sbi bank';
      const context: AIContext = {
        accounts: ['SBI Bank'],
        categories: ['Shopping'],
        parserHints: {
          amount: 1200,
          rawAccount: 'sbi bank',
          rawItem: 'amazon',
        },
      };

      mockEngine.generate.mockResolvedValue({
        text: '[1,0,0]',
      } as GenerateResult);

      const result = await provider.parse(transcript, context, { mode: 'single' });
      expect(result).not.toBeNull();

      const tx = result!.transactions[0];
      expect(tx.type).toBe('income');
      expect(tx.isReversal).toBe(true);
    });
  });

  describe('parseMultiPass', () => {
    it('successfully parses multi-pass with 3 sequential calls', async () => {
      const transcript = 'spent 250 rs for coffee at starbucks using hdfc card';
      const context: AIContext = {
        accounts: ['HDFC Card', 'Cash'],
        categories: ['Food & Drinks', 'Travel'],
        parserHints: {
          amount: 250,
          rawAccount: 'hdfc card',
          rawItem: 'coffee',
        },
      };

      mockEngine.generate
        .mockResolvedValueOnce({ text: '0' } as GenerateResult)
        .mockResolvedValueOnce({ text: '0' } as GenerateResult)
        .mockResolvedValueOnce({ text: '0' } as GenerateResult);

      const result = await provider.parse(transcript, context, { mode: 'multi' });

      expect(result).not.toBeNull();
      expect(result!.transactions).toHaveLength(1);

      const tx = result!.transactions[0];
      expect(tx.type).toBe('expense');
      expect(tx.amount).toBe(250);
      expect(tx.accountNameHint).toBe('HDFC Card');
      expect(tx.categoryNameHint).toBe('Food & Drinks');
      expect(mockEngine.generate).toHaveBeenCalledTimes(3);

      expect(mockEngine.generate.mock.calls[0][0]).toContain('Task: Classify transaction type');
      expect(mockEngine.generate.mock.calls[1][0]).toContain('Task: Identify the SOURCE_ACCOUNT');
      expect(mockEngine.generate.mock.calls[2][0]).toContain('Task: Identify the TARGET_CATEGORY');
    });

    it('bypasses Pass 1 Type Classification if direction is known', async () => {
      const transcript = 'spent 250 rs for coffee at starbucks using hdfc card';
      const context: AIContext = {
        accounts: ['HDFC Card', 'Cash'],
        categories: ['Food & Drinks', 'Travel'],
        parserHints: {
          amount: 250,
          rawAccount: 'hdfc card',
          rawItem: 'coffee',
          direction: 'debit',
        },
      };

      mockEngine.generate
        .mockResolvedValueOnce({ text: '0' } as GenerateResult)
        .mockResolvedValueOnce({ text: '0' } as GenerateResult);

      const result = await provider.parse(transcript, context, { mode: 'multi' });

      expect(result).not.toBeNull();
      expect(result!.transactions).toHaveLength(1);
      expect(mockEngine.generate).toHaveBeenCalledTimes(2);
    });
  });
});
