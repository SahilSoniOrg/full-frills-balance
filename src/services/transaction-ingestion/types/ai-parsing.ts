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
  provider: 'deterministic' | 'ai' | 'typesafe';
  processTimeMs?: number;
  debugMetrics?: {
    passTimings?: Record<string, number>;
    totalInferenceMs?: number;
  };
}

export interface AIContext {
  accounts: TypeSafeCandidate[];
  categories: TypeSafeCandidate[];
  parserHints: {
    amount?: number;
    rawAccount?: string;
    rawItem?: string;
    intentHint?: string;
    direction?: 'credit' | 'debit' | 'unknown';
  };
}

/** A database-backed candidate. TypeSafe may select only one of these IDs. */
export interface TypeSafeCandidate {
  id: string;
  name: string;
}

export interface TransactionFallbackAIProvider {
  parse(
    transcript: string,
    context: AIContext,
    options?: {
      timeout?: number;
    },
  ): Promise<ParserOutput | null>;
}
