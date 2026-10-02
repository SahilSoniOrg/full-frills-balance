export type TransactionType = 'expense' | 'income' | 'transfer' | 'unknown';

export type TransactionSemanticTag = 'refund' | 'cashback' | 'chargeback' | 'reversal' | undefined;

interface TransactionResult {
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
  provider: 'deterministic';
  processTimeMs?: number;
}
