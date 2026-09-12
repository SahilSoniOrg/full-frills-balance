import { AccountType, JournalDisplayType, SemanticType, TransactionType } from '@/src/types/enums';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { asAccountId } from '@/src/types/ids';
import type {
  FlowClassification,
  ClassificationLine,
  JournalClassification,
} from './classificationTypes';

const semantic = (lines: readonly ClassificationLine[]): string | undefined => {
  const value = lines.find(line => line.semanticType)?.semanticType;
  return value ? String(value) : undefined;
};

export function classifyJournal(lines: readonly ClassificationLine[]): JournalClassification {
  const accountTypes = new Map<string, AccountType>();
  lines.forEach((line, index) => accountTypes.set(String(index), line.accountType));
  const presenterLines = lines.map((line, index) => ({
    accountId: asAccountId(String(index)),
    amount: line.amount,
    transactionType: line.transactionType as TransactionType,
  }));
  const displayType = journalPresenter.getJournalDisplayType(presenterLines, accountTypes);
  const hasIncome = lines.some(line => line.accountType === AccountType.INCOME);
  const hasExpense = lines.some(line => line.accountType === AccountType.EXPENSE);
  const type = semantic(lines);

  let flow: FlowClassification = 'UNKNOWN';
  if (
    type === SemanticType.REFUND ||
    type === SemanticType.CREDIT_REFUND ||
    type === SemanticType.EXPENSE_REVERSAL
  ) {
    flow = 'REFUND';
  } else if (type === SemanticType.BORROWING) {
    flow = 'BORROWING';
  } else if (type === SemanticType.DEBT_PAYMENT || type === SemanticType.DEBT_PAYDOWN) {
    flow = 'DEBT_PAYMENT';
  } else if (
    type === SemanticType.TRANSFER ||
    type === SemanticType.LIABILITY_TRANSFER ||
    type === SemanticType.EQUITY_TRANSFER
  ) {
    flow = 'TRANSFER';
  } else if (hasIncome) {
    flow = 'INCOME';
  } else if (hasExpense) {
    flow = 'EXPENSE';
  } else if (displayType === JournalDisplayType.TRANSFER) {
    flow = 'TRANSFER';
  } else if (lines.some(line => line.accountType === AccountType.EQUITY)) {
    flow = 'EQUITY';
  }

  return {
    displayType,
    flow,
    hasIncome,
    hasExpense,
    isTransfer: flow === 'TRANSFER',
  };
}

export function classifyFactFlow(fact: {
  accountType: AccountType;
  signedBalanceDelta: number;
  semanticType?: SemanticType | string;
}): FlowClassification {
  const type = fact.semanticType ? String(fact.semanticType) : undefined;
  if (type === SemanticType.BORROWING) return 'BORROWING';
  if (type === SemanticType.DEBT_PAYMENT || type === SemanticType.DEBT_PAYDOWN) {
    return 'DEBT_PAYMENT';
  }
  if (
    type === SemanticType.REFUND ||
    type === SemanticType.CREDIT_REFUND ||
    type === SemanticType.EXPENSE_REVERSAL ||
    (fact.accountType === AccountType.EXPENSE && fact.signedBalanceDelta < 0)
  ) {
    return 'REFUND';
  }
  if (fact.accountType === AccountType.INCOME) return 'INCOME';
  if (fact.accountType === AccountType.EXPENSE) return 'EXPENSE';
  if (
    type === SemanticType.TRANSFER ||
    type === SemanticType.LIABILITY_TRANSFER ||
    type === SemanticType.EQUITY_TRANSFER
  ) {
    return 'TRANSFER';
  }
  if (fact.accountType === AccountType.EQUITY) return 'EQUITY';
  return 'UNKNOWN';
}
