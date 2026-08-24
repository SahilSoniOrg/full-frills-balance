import Account from '@/src/data/models/Account';
import { WorkplaceId } from '@/src/types/ids';
import { ParserOutput, TransactionFallbackAIProvider } from '../types/ai-parsing';

export interface PipelineContext {
  transcript: string;
  workplaceId: WorkplaceId;
  forceAi: boolean;
  startTime: number;
  aiProvider: TransactionFallbackAIProvider;

  // Populated by ContextGatheringStep
  defaultCurrency?: string;
  allAccounts?: Account[];

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

  isHalted: boolean;
}

export interface PipelineStep {
  execute(context: PipelineContext): Promise<void>;
}
