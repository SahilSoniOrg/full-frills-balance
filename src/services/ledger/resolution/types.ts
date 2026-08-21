import { AccountId, WorkplaceId } from '@/src/types/domain';

export interface ResolutionResult {
  sourceAccountId: AccountId; // Mapped Asset / Liability account
  categoryAccountId: AccountId; // Mapped Income / Expense category account
  sourceAccountName?: string;
  categoryAccountName?: string;
  confidence: number;
  strategyUsed: 'fuzzy' | 'history' | 'bayes' | 'default';
  semanticType?: string;
  isReversal?: boolean;
}

export interface ResolutionParams {
  sourceHint?: string;
  destinationHint?: string;
  direction: 'debit' | 'credit' | 'unknown';
  workplaceId: WorkplaceId;
  isReversal?: boolean;
  rawText?: string;
  unconstrained?: boolean; // If true, allows matching sourceHint to category and vice versa
}
