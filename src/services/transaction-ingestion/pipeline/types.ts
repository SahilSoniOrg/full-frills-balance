import type { WorkplaceId } from '@/src/types/ids';
import type { ParserOutput } from '../types/ai-parsing';

export interface IngestionContext {
  transcript: string;
  workplaceId: WorkplaceId;
  forceAi: boolean;
  startTime: number;

  defaultCurrency: string;

  // Populated by DeterministicStep
  parsed?: {
    amount?: number;
    direction: 'credit' | 'debit' | 'unknown';
    currencyCode?: string;
    sourceAccountHint?: string;
    destinationCategoryHint?: string;
    isReversal?: boolean;
  };
  resolved?: {
    confidence: number;
    sourceAccountId?: string;
    categoryAccountId?: string;
    sourceAccountName?: string;
    categoryAccountName?: string;
    semanticType?: string;
  };

  // The final result
  result?: ParserOutput;
}
