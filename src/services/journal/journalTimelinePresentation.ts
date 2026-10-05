import { AppConfig } from '@/src/constants';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalDisplayType, SemanticType } from '@/src/types/enums';
import { Icon, isValidIconName, parseIconName } from '@/src/types/domainIcons';
import {
  convertJournalCurrencyAmount,
  resolveJournalFxRate,
} from '@/src/domain/accounting/journalFx';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { getAccountTypeVariant } from '@/src/utils/accountCategory';
import {
  JournalEntryAccountFlow,
  JournalEntryCardProps,
  JournalEntryLeg,
} from '@/src/types/journalEntryCard';
import { JournalTimelineIconKey, JournalTimelineViewer } from '@/src/types/journalTimeline';

const ROUTINE_SEMANTIC_TYPES = new Set<SemanticType>([
  SemanticType.TRANSFER,
  SemanticType.PURCHASE,
  SemanticType.INCOME_RECEIVED,
  SemanticType.DEBT_PAYMENT,
]);
const ROUTINE_DISPLAY_TYPES = new Set<JournalDisplayType>([
  JournalDisplayType.INCOME,
  JournalDisplayType.EXPENSE,
  JournalDisplayType.TRANSFER,
]);

export function journalDisplayTypeChrome(displayType: JournalDisplayType): {
  typeIcon: JournalTimelineIconKey;
  amountPrefix: string;
} {
  let typeIcon: JournalTimelineIconKey = Icon.Document;
  let amountPrefix = '';

  if (displayType === JournalDisplayType.INCOME) {
    typeIcon = Icon.ArrowUp;
    amountPrefix = '+ ';
  } else if (displayType === JournalDisplayType.EXPENSE) {
    typeIcon = Icon.ArrowDown;
    amountPrefix = '− ';
  } else if (displayType === JournalDisplayType.TRANSFER) {
    typeIcon = Icon.SwapHorizontal;
  }

  return { typeIcon, amountPrefix };
}

export function ledgerLineChrome(isIncrease: boolean): {
  typeIcon: JournalTimelineIconKey;
  amountPrefix: string;
} {
  return {
    typeIcon: isIncrease ? Icon.ArrowUp : Icon.ArrowDown,
    amountPrefix: isIncrease ? '+ ' : '− ',
  };
}

function toCardPresentation(
  displayType: JournalDisplayType,
  semanticLabel: string | undefined,
  semanticType: SemanticType | undefined,
  chrome: ReturnType<typeof journalDisplayTypeChrome>,
): JournalEntryCardProps['presentation'] {
  const presentation = journalPresenter.getPresentation(displayType, semanticLabel, semanticType);
  const hasSemanticType = semanticType != null && semanticType !== SemanticType.UNKNOWN;
  return {
    label: presentation.label,
    showTypeBadge: hasSemanticType
      ? !ROUTINE_SEMANTIC_TYPES.has(semanticType)
      : !ROUTINE_DISPLAY_TYPES.has(displayType),
    typeColor: presentation.colorKey,
    typeIcon: chrome.typeIcon,
    amountPrefix: chrome.amountPrefix,
  };
}

function buildAccountFlow(
  journal: EnrichedJournal,
  viewerAccount?: EnrichedJournal['accounts'][number],
): JournalEntryAccountFlow {
  const journalPrecision = CurrencyFormatter.getPrecisionFallback(journal.currencyCode);
  const legs = journal.accounts.map((account, index) => {
    const currencyCode = account.currencyCode?.trim().toUpperCase();
    const amount =
      account.amount != null && Number.isFinite(account.amount) && account.amount >= 0
        ? account.amount
        : undefined;
    const rate = currencyCode
      ? resolveJournalFxRate({
          accountCurrency: currencyCode,
          journalCurrency: journal.currencyCode,
          importedRate: account.exchangeRate,
        }).rate
      : undefined;
    const journalAmount =
      amount != null && rate != null && currencyCode
        ? convertJournalCurrencyAmount({
            nativeAmount: amount,
            nativePrecision: CurrencyFormatter.getPrecisionFallback(currencyCode),
            exchangeRate: rate,
            journalPrecision,
          }).journalAmount
        : undefined;
    const leg: JournalEntryLeg = {
      id: account.transactionId ?? `${account.id}:${account.role}:${index}`,
      accountId: account.id,
      name: account.name,
      role: account.role,
      icon: isValidIconName(account.icon) ? account.icon : undefined,
      color: account.color,
      fallbackIcon: parseIconName(getAccountFallbackIcon(account.accountType), Icon.Wallet),
      variant: getAccountTypeVariant(account.accountType),
    };
    return { account, leg, journalAmount };
  });

  const byRole = (role: JournalEntryLeg['role']) => {
    const group = legs.filter(item => item.leg.role === role);
    // Unknown historical rates cannot be compared to native amounts. Keep a stable order.
    const allComparable = group.every(item => item.journalAmount != null);
    return group.sort((a, b) => {
      const amountOrder = allComparable ? b.journalAmount! - a.journalAmount! : 0;
      return (
        amountOrder ||
        a.leg.accountId.localeCompare(b.leg.accountId) ||
        a.leg.id.localeCompare(b.leg.id)
      );
    });
  };
  const sources = byRole('SOURCE');
  const destinations = byRole('DESTINATION');
  const neutral = byRole('NEUTRAL');
  const primary = viewerAccount ? legs.find(item => item.account === viewerAccount) : sources[0];
  const peers = (group: typeof legs) =>
    group
      .filter(item => (viewerAccount ? item.leg.accountId !== viewerAccount.id : item !== primary))
      .map(item => item.leg);
  const currencies = new Set([
    journal.currencyCode.trim().toUpperCase(),
    ...journal.accounts.map(account => account.currencyCode?.trim().toUpperCase()).filter(Boolean),
  ]);

  return {
    primaryAccount: primary?.leg,
    sources: peers(sources),
    destinations: peers(destinations),
    neutral: peers(neutral),
    showCurrencyCodes: currencies.size > 1,
  };
}

export function mapJournalToEntryCardProps(
  journal: EnrichedJournal,
  viewer?: JournalTimelineViewer,
): Omit<JournalEntryCardProps, 'onPress'> {
  const displayType = journal.displayType as JournalDisplayType;
  const defaultTitle =
    displayType === JournalDisplayType.TRANSFER
      ? AppConfig.strings.journal.transfer
      : AppConfig.strings.journal.transaction;

  // Missing account/posting scopes use the whole-journal presentation.
  const viewerAccount = viewer
    ? journal.accounts.find(
        account =>
          account.id === viewer.accountId &&
          (!viewer.transactionId || account.transactionId === viewer.transactionId),
      )
    : undefined;
  const chrome = viewerAccount
    ? ledgerLineChrome(viewerAccount.role === 'DESTINATION')
    : journalDisplayTypeChrome(displayType);

  return {
    title: journal.description || defaultTitle,
    amount: viewerAccount?.amount ?? journal.totalAmount,
    currencyCode: viewerAccount?.currencyCode || journal.currencyCode,
    transactionDate: journal.journalDate,
    presentation: toCardPresentation(
      displayType,
      journal.semanticLabel,
      journal.semanticType,
      chrome,
    ),
    accountFlow: buildAccountFlow(journal, viewerAccount),
    notes: journal.notes,
  };
}
