import type { AccountType, JournalDisplayType, SemanticType } from '@/src/types/enums';

export type FlowClassification =
  | 'INCOME'
  | 'EXPENSE'
  | 'REFUND'
  | 'TRANSFER'
  | 'BORROWING'
  | 'DEBT_PAYMENT'
  | 'EQUITY'
  | 'UNKNOWN';

export interface ClassificationLine {
  accountType: AccountType;
  transactionType: 'DEBIT' | 'CREDIT';
  amount: number;
  semanticType?: SemanticType | string;
}

export interface JournalClassification {
  displayType: JournalDisplayType;
  flow: FlowClassification;
  hasIncome: boolean;
  hasExpense: boolean;
  isTransfer: boolean;
}
