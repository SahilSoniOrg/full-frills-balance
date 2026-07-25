import { TransactionCardProps } from '@/src/components/common/TransactionCard';
import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig } from '@/src/constants';
import { buildTransactionAccountBadges } from '@/src/services/accounting/transactionAccountBadges';
import { buildCounterAccountChips } from '@/src/services/accounting/displayTransactionCounterAccounts';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import {
  DisplayTransaction,
  EnrichedJournal,
  JournalDisplayType,
  SemanticType,
} from '@/src/types/domain';

export function journalDisplayTypeChrome(displayType: JournalDisplayType): {
  typeIcon: IconName;
  amountPrefix: string;
} {
  let typeIcon: IconName = 'document';
  let amountPrefix = '';

  if (displayType === JournalDisplayType.INCOME) {
    typeIcon = 'arrowUp';
    amountPrefix = '+ ';
  } else if (displayType === JournalDisplayType.EXPENSE) {
    typeIcon = 'arrowDown';
    amountPrefix = '− ';
  } else if (displayType === JournalDisplayType.TRANSFER) {
    typeIcon = 'swapHorizontal';
  }

  return { typeIcon, amountPrefix };
}

export function ledgerLineChrome(isIncrease: boolean): {
  typeIcon: IconName;
  amountPrefix: string;
} {
  return {
    typeIcon: isIncrease ? 'arrowUp' : 'arrowDown',
    amountPrefix: isIncrease ? '+ ' : '− ',
  };
}

/**
 * Maps an EnrichedJournal model to props compatible with TransactionCard
 */
export function mapJournalToCardProps(
  journal: EnrichedJournal,
): Omit<TransactionCardProps, 'onPress'> {
  const displayType = journal.displayType as JournalDisplayType;
  const presentation = journalPresenter.getPresentation(
    displayType,
    journal.semanticLabel,
    journal.semanticType,
  );
  const { typeIcon, amountPrefix } = journalDisplayTypeChrome(displayType);
  const badges = buildTransactionAccountBadges(journal.accounts, { withFromToPrefixes: true });

  const defaultTitle =
    displayType === JournalDisplayType.TRANSFER
      ? AppConfig.strings.journal.transfer
      : AppConfig.strings.journal.transaction;

  return {
    title: journal.description || defaultTitle,
    amount: journal.totalAmount,
    currencyCode: journal.currencyCode,
    transactionDate: journal.journalDate,
    presentation: {
      label: presentation.label,
      typeColor: presentation.colorKey,
      typeIcon,
      amountPrefix,
    },
    badges,
    notes: journal.notes,
  };
}

export function mapLedgerTransactionToCardProps(
  transaction: DisplayTransaction,
): Omit<TransactionCardProps, 'onPress'> {
  const base = journalPresenter.getPresentation(
    transaction.displayType as JournalDisplayType,
    transaction.semanticLabel,
    transaction.semanticType as SemanticType | undefined,
  );
  const { typeIcon, amountPrefix } = ledgerLineChrome(transaction.isIncrease);
  const counterChips = buildCounterAccountChips(transaction);

  return {
    title: transaction.journalDescription || transaction.displayTitle || 'Transaction',
    amount: transaction.amount,
    currencyCode: transaction.currencyCode,
    transactionDate: transaction.transactionDate,
    presentation: {
      label: base.label,
      typeColor: base.colorKey,
      typeIcon,
      amountPrefix,
    },
    badges: buildTransactionAccountBadges(counterChips),
    notes: transaction.notes,
  };
}
