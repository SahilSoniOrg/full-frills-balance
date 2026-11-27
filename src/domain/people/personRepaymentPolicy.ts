import { fromMinorUnits, toMinorUnits } from '@/src/domain/money/money';
import { AccountType, JournalStatus, TransactionType } from '@/src/types/enums';
import { classifyPersonDebtPosting } from './personAccountPolicy';

export function isRepaymentJournal(journal: {
  status: string;
  originalJournalId?: string | null;
  reversingJournalId?: string | null;
}) {
  return (
    journal.status === JournalStatus.POSTED &&
    !journal.originalJournalId &&
    !journal.reversingJournalId
  );
}

export function acceptsRepaymentDirection(
  accountType: AccountType,
  cashDirection: TransactionType,
) {
  const personDirection =
    cashDirection === TransactionType.DEBIT ? TransactionType.CREDIT : TransactionType.DEBIT;
  return (
    classifyPersonDebtPosting({ accountType, transactionType: personDirection }) === 'reducing'
  );
}

export function availableRepaymentMinorUnits(
  reducingMinorUnits: number,
  allocations: readonly { amount: number }[],
  precision: number,
) {
  return Math.max(
    0,
    reducingMinorUnits -
      allocations.reduce(
        (total, allocation) => total + toMinorUnits(allocation.amount, precision),
        0,
      ),
  );
}

export function matchRepaymentAmount(journalAmount: number, rate: number, precision: number) {
  return fromMinorUnits(toMinorUnits(journalAmount / rate, precision), precision);
}
