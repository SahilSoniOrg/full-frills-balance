import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { AccountId, JournalEntryLine, TabType, TransactionId } from '@/src/types/domain';

/** Enriched journal leg as returned for edit-mode load (transaction service / repository). */
export interface JournalEditorEnrichedLine {
  id: TransactionId | string;
  accountId: AccountId | string;
  accountName?: string;
  accountType?: AccountType;
  amount: number;
  transactionType: TransactionType | string;
  notes?: string | null;
  exchangeRate?: number | null;
  currencyCode?: string;
}

/**
 * Infers simple-mode tab (expense / income / transfer) from credit and debit account types.
 * Credit leg is treated as the "source" in guided mode.
 */
export function inferSimpleTabTypeFromTwoLegs(
  creditAccountType: AccountType | undefined,
  debitAccountType: AccountType | undefined,
): TabType {
  if (!creditAccountType || !debitAccountType) {
    return 'transfer';
  }

  const sourceIsAssetLiab =
    creditAccountType === AccountType.ASSET || creditAccountType === AccountType.LIABILITY;
  const destIsExpense = debitAccountType === AccountType.EXPENSE;
  const sourceIsIncome = creditAccountType === AccountType.INCOME;
  const destIsAssetLiab =
    debitAccountType === AccountType.ASSET || debitAccountType === AccountType.LIABILITY;

  if (sourceIsAssetLiab && destIsExpense) return 'expense';
  if (sourceIsIncome && destIsAssetLiab) return 'income';
  return 'transfer';
}

/** Collapses journal lines to the two-leg credit-then-debit shape used in guided mode. */
export function normalizeJournalLinesForGuidedMode(lines: JournalEntryLine[]): JournalEntryLine[] {
  const debit = lines.find(l => l.transactionType === TransactionType.DEBIT) || lines[0];
  const credit = lines.find(l => l.transactionType === TransactionType.CREDIT) || lines[1];
  return [
    { ...credit, id: '1' as TransactionId, transactionType: TransactionType.CREDIT },
    { ...debit, id: '2' as TransactionId, transactionType: TransactionType.DEBIT },
  ];
}

export interface JournalEditorLoadFromEnrichedResult {
  lines: JournalEntryLine[];
  forceAdvancedMode: boolean;
  simpleTabType?: TabType;
}

/** Maps enriched journal legs into editor state when loading an existing journal. */
export function mapEnrichedLinesToEditorState(
  txs: JournalEditorEnrichedLine[],
): JournalEditorLoadFromEnrichedResult {
  const forceAdvancedMode = txs.length > 2;
  let simpleTabType: TabType | undefined;

  if (txs.length === 2) {
    const creditTx = txs.find(t => t.transactionType === TransactionType.CREDIT);
    const debitTx = txs.find(t => t.transactionType === TransactionType.DEBIT);
    if (creditTx && debitTx) {
      simpleTabType = inferSimpleTabTypeFromTwoLegs(creditTx.accountType, debitTx.accountType);
    }
  }

  const lines: JournalEntryLine[] = txs.map(tx => ({
    id: tx.id as TransactionId,
    accountId: tx.accountId as AccountId,
    accountName: tx.accountName || '',
    accountType: tx.accountType || AccountType.ASSET,
    amount: tx.amount.toString(),
    transactionType: tx.transactionType as TransactionType,
    notes: tx.notes || '',
    exchangeRate: tx.exchangeRate ? tx.exchangeRate.toString() : '',
    accountCurrency: tx.currencyCode,
  }));

  return { lines, forceAdvancedMode, simpleTabType };
}
