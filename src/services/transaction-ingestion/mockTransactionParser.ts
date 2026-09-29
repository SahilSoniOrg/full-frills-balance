import { logger } from '@/src/utils/logger';
import type { ParserOutput } from './types/ai-parsing';

export async function parseMockTransaction(transcript: string): Promise<ParserOutput | null> {
  logger.info('[MockAI] Parsing transcript:', { transcript });
  await new Promise(resolve => setTimeout(resolve, 800));

  if (transcript.includes('mock ai success')) {
    return {
      transactions: [
        {
          type: 'expense',
          amount: 500,
          currencyCode: 'INR',
          description: 'Mocked AI response',
          accountNameHint: 'Cash',
          categoryNameHint: 'Food',
        },
      ],
      confidenceScore: 0.95,
      isHighConfidence: true,
      provider: 'ai',
    };
  }

  return null;
}
