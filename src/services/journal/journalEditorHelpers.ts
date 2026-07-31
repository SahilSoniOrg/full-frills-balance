import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { JournalLineInput } from '@/src/services/accounting/JournalCalculator';
import {
  AccountId,
  EMPTY_ACCOUNT_ID,
  JournalEntryLine,
  TabType,
  TransactionId,
} from '@/src/types/domain';

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

function isTransactionType(value: string): value is TransactionType {
  return value === TransactionType.DEBIT || value === TransactionType.CREDIT;
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

export interface NormalizeGuidedModeResult {
  lines: JournalEntryLine[];
  forceAdvancedMode: boolean;
}

/** Collapses journal lines to the two-leg credit-then-debit shape used in guided mode. */
export function normalizeJournalLinesForGuidedMode(
  lines: JournalEntryLine[],
): NormalizeGuidedModeResult {
  const debit = lines.find(l => l.transactionType === TransactionType.DEBIT);
  const credit = lines.find(l => l.transactionType === TransactionType.CREDIT);
  if (!debit || !credit) {
    return { lines, forceAdvancedMode: true };
  }
  return {
    lines: [
      { ...credit, id: '1' as TransactionId, transactionType: TransactionType.CREDIT },
      { ...debit, id: '2' as TransactionId, transactionType: TransactionType.DEBIT },
    ],
    forceAdvancedMode: false,
  };
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
  let forceAdvancedMode = txs.length > 2;
  let simpleTabType: TabType | undefined;

  const lines: JournalEntryLine[] = txs.map(tx => {
    const rawType = String(tx.transactionType);
    const transactionType = isTransactionType(rawType) ? rawType : undefined;
    if (!tx.accountType || !transactionType) {
      forceAdvancedMode = true;
    }

    return {
      id: tx.id as TransactionId,
      accountId: tx.accountId as AccountId,
      accountName: tx.accountName || '',
      // Placeholder only when forcing advanced; guided mode requires real types.
      accountType: tx.accountType ?? AccountType.ASSET,
      amount: tx.amount.toString(),
      transactionType: transactionType ?? TransactionType.DEBIT,
      notes: tx.notes || '',
      exchangeRate: tx.exchangeRate ? tx.exchangeRate.toString() : '',
      accountCurrency: tx.currencyCode,
    };
  });

  if (!forceAdvancedMode && txs.length === 2) {
    const creditTx = txs.find(t => t.transactionType === TransactionType.CREDIT);
    const debitTx = txs.find(t => t.transactionType === TransactionType.DEBIT);
    if (creditTx?.accountType && debitTx?.accountType) {
      simpleTabType = inferSimpleTabTypeFromTwoLegs(creditTx.accountType, debitTx.accountType);
    } else {
      forceAdvancedMode = true;
    }
  }

  return { lines, forceAdvancedMode, simpleTabType };
}

/** Maps editor lines into the shape used by JournalCalculator balance checks. */
export function mapEditorLinesForBalanceCheck(
  lines: JournalEntryLine[],
  _workplaceCurrency: string,
): JournalLineInput[] {
  return lines.map(l => ({
    amount: l.amount,
    type: l.transactionType,
    exchangeRate: l.exchangeRate,
    accountCurrency: l.accountCurrency,
  }));
}

/** True when every line has an account and a parseable amount (ready to balance). */
export function isJournalEditorEntryReady(
  lines: JournalEntryLine[],
  _workplaceCurrency: string,
): boolean {
  return lines.every(
    l =>
      l.accountId !== EMPTY_ACCOUNT_ID &&
      l.amount !== '' &&
      !isNaN(parseFloat(l.amount.toString())),
  );
}

/** Line counts toward the simple-mode two-leg limit only when the user has entered data. */
export function isSubstantiveEditorLine(line: JournalEntryLine): boolean {
  const hasAccount = line.accountId !== EMPTY_ACCOUNT_ID;
  const amountStr = String(line.amount ?? '').trim();
  const hasAmount = amountStr !== '' && !Number.isNaN(Number.parseFloat(amountStr));
  return hasAccount || hasAmount;
}

export function countSubstantiveEditorLines(lines: JournalEntryLine[]): number {
  return lines.filter(isSubstantiveEditorLine).length;
}

export function isSimpleModeDisabledByLines(lines: JournalEntryLine[]): boolean {
  return countSubstantiveEditorLines(lines) > 2;
}

/** Empty two-leg credit/debit scaffold used when leaving Split/Bulk or creating a new entry. */
export function createTwoLegJournalScaffold(options?: {
  amount?: string;
  sourceAccountId?: AccountId;
  destinationAccountId?: AccountId;
}): JournalEntryLine[] {
  const amount = options?.amount ?? '';
  return [
    {
      id: '1' as TransactionId,
      accountId: options?.destinationAccountId || EMPTY_ACCOUNT_ID,
      accountName: '',
      accountType: AccountType.ASSET,
      amount,
      transactionType: TransactionType.DEBIT,
      notes: '',
      exchangeRate: '',
    },
    {
      id: '2' as TransactionId,
      accountId: options?.sourceAccountId || EMPTY_ACCOUNT_ID,
      accountName: '',
      accountType: AccountType.ASSET,
      amount,
      transactionType: TransactionType.CREDIT,
      notes: '',
      exchangeRate: '',
    },
  ];
}
