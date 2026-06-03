import type { InferenceStats } from '@/src/services/ai/types';

export type TransactionType = 'expense' | 'income' | 'transfer' | 'unknown';

export type TransactionSemanticTag = 'refund' | 'cashback' | 'chargeback' | 'reversal' | undefined;

export interface TransactionResult {
  type: TransactionType;
  semanticTag?: TransactionSemanticTag;
  amount?: number;
  currencyCode?: string;

  accountNameHint?: string;
  categoryNameHint?: string;

  accountId?: string;
  categoryId?: string;

  description?: string;
  isReversal?: boolean;
}

export interface ParserOutput {
  transactions: TransactionResult[];
  confidenceScore: number;
  isHighConfidence: boolean;
  provider: 'deterministic' | 'ai';
  processTimeMs?: number;
  debugMetrics?: {
    passTimings?: Record<string, number>;
    totalInferenceMs?: number;
    lastPassStats?: InferenceStats;
    memorySummary?: any;
  };
}

export interface AIContext {
  accounts: string[];
  categories: string[];
  parserHints: {
    amount?: number;
    rawAccount?: string;
    rawItem?: string;
    intentHint?: string;
    direction?: 'credit' | 'debit' | 'unknown';
  };
}

export interface TransactionFallbackAIProvider {
  parse(
    transcript: string,
    context: AIContext,
    options?: {
      mode?: 'single' | 'multi';
      timeout?: number;
    },
  ): Promise<ParserOutput | null>;
}
