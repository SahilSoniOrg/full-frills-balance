import { AppConfig } from '@/src/constants';
import { counterAccountsFromJournalPeers } from '@/src/services/accounting/displayTransactionCounterAccounts';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { buildTimelineAccountBadges } from '@/src/services/accounting/timelineAccountBadges';
import { EnrichedJournal, JournalDisplayType, SemanticType } from '@/src/types/domain';
import {
  JournalTimelineIconKey,
  JournalTimelineItem,
  JournalTimelinePresentation,
  JournalTimelineViewer,
} from '@/src/types/journalTimeline';

export function journalDisplayTypeChrome(displayType: JournalDisplayType): {
  typeIcon: JournalTimelineIconKey;
  amountPrefix: string;
} {
  let typeIcon: JournalTimelineIconKey = 'document';
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
  typeIcon: JournalTimelineIconKey;
  amountPrefix: string;
} {
  return {
    typeIcon: isIncrease ? 'arrowUp' : 'arrowDown',
    amountPrefix: isIncrease ? '+ ' : '− ',
  };
}

function toTimelinePresentation(
  displayType: JournalDisplayType,
  semanticLabel: string | undefined,
  semanticType: SemanticType | undefined,
  chrome: ReturnType<typeof journalDisplayTypeChrome>,
): JournalTimelinePresentation {
  const presentation = journalPresenter.getPresentation(displayType, semanticLabel, semanticType);
  return {
    label: presentation.label,
    typeColorKey: presentation.colorKey,
    typeIcon: chrome.typeIcon,
    amountPrefix: chrome.amountPrefix,
  };
}

export function mapJournalToTimelineItem(
  journal: EnrichedJournal,
  viewer?: JournalTimelineViewer,
): JournalTimelineItem {
  const displayType = journal.displayType as JournalDisplayType;
  const defaultTitle =
    displayType === JournalDisplayType.TRANSFER
      ? AppConfig.strings.journal.transfer
      : AppConfig.strings.journal.transaction;

  if (viewer) {
    const viewerAccount = journal.accounts.find(a => a.id === viewer.accountId);
    const isIncrease = viewerAccount?.role === 'DESTINATION';
    const chrome = ledgerLineChrome(isIncrease);
    const presentation = toTimelinePresentation(
      displayType,
      journal.semanticLabel,
      journal.semanticType,
      chrome,
    );
    const counterAccounts = counterAccountsFromJournalPeers(journal.accounts, viewer.accountId);
    const badges = buildTimelineAccountBadges(counterAccounts);

    return {
      title: journal.description || defaultTitle,
      amount: viewerAccount?.amount ?? journal.totalAmount,
      currencyCode: journal.currencyCode,
      transactionDate: journal.journalDate,
      presentation,
      badges,
      notes: journal.notes,
    };
  }

  const chrome = journalDisplayTypeChrome(displayType);
  const presentation = toTimelinePresentation(
    displayType,
    journal.semanticLabel,
    journal.semanticType,
    chrome,
  );
  const badges = buildTimelineAccountBadges(journal.accounts, { withFromToPrefixes: true });

  return {
    title: journal.description || defaultTitle,
    amount: journal.totalAmount,
    currencyCode: journal.currencyCode,
    transactionDate: journal.journalDate,
    presentation,
    badges,
    notes: journal.notes,
  };
}
