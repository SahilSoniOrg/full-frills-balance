import { AIContext, ParserOutput, TransactionFallbackAIProvider } from '../types/ai-parsing';
import { logger } from '@/src/utils/logger';

export class MockTransactionFallbackAIProvider implements TransactionFallbackAIProvider {
  async parse(transcript: string, _context: AIContext): Promise<ParserOutput | null> {
    logger.info('[MockAI] Parsing transcript:', { transcript });
    // Simulate some network/inference latency
    await new Promise(resolve => setTimeout(resolve, 800));

    // Return null to simulate AI failing or not being confident,
    // which triggers the deterministic fallback.
    // In a real mock, we could return a predefined response if the transcript matches a certain pattern.
    if (transcript.includes('mock ai success')) {
      return {
        transactions: [
          {
            type: 'expense',
            amount: 500,
            currencyCode: 'INR',
            description: 'Mocked AI response',
            accountNameHint: 'Cash', // This will be resolved to a real ID if "Cash" exists
            categoryNameHint: 'Food', // This will be resolved to a real ID if "Food" exists
          },
        ],
        confidenceScore: 0.95,
        isHighConfidence: true,
        provider: 'ai',
      };
    }

    return null;
  }
}

export const mockAIProvider = new MockTransactionFallbackAIProvider();
