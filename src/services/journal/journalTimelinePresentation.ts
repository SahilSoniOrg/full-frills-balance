import { AppConfig } from '@/src/constants';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalDisplayType, SemanticType } from '@/src/types/enums';
import {
  flowIconKey,
  journalFlowSign,
  legSign,
  signColorKey,
  signPrefix,
  transactionTypeForRole,
  type FlowSign,
} from '@/src/domain/accounting/presentationPolicy';
import { Icon, isValidIconName, parseIconName } from '@/src/types/domainIcons';
import {
  convertJournalCurrencyAmount,
  resolveJournalFxRate,
} from '@/src/domain/accounting/journalFx';

import { getAccountFallbackIcon } from '@/src/design-system/accountIcon';
import { getAccountTypeVariant } from '@/src/design-system/accountPresentation';
import {
  JournalEntryAccountFlow,
  JournalEntryCardProps,
  JournalEntryLeg,
} from '@/src/types/journalEntryCard';
import { JournalTimelineIconKey, JournalTimelineViewer } from '@/src/types/journalTimeline';
import type { AccountId } from '@/src/types/ids';

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

const ICON_BY_FLOW_KEY: Record<ReturnType<typeof flowIconKey>, JournalTimelineIconKey> = {
  up: Icon.ArrowUp,
  down: Icon.ArrowDown,
  swap: Icon.SwapHorizontal,
  document: Icon.Document,
};

/** The leg a timeline view is scoped to, when the journal carries it. */
export function viewerLegOf(
  journal: EnrichedJournal,
  viewer?: JournalTimelineViewer,
): EnrichedJournal['accounts'][number] | undefined {
  if (!viewer) return undefined;
  return journal.accounts.find(
    account =>
      account.id === viewer.accountId &&
      (!viewer.transactionId || account.transactionId === viewer.transactionId),
  );
}

/**
 * Icon and prefix for a FLOW row. Balance-sheet-only rows get a neutral icon
 * and no prefix.
 */
export function flowChrome(
  sign: FlowSign,
  displayType: JournalDisplayType,
): { typeIcon: JournalTimelineIconKey; amountPrefix: string } {
  return {
    typeIcon: ICON_BY_FLOW_KEY[flowIconKey(sign, displayType)],
    amountPrefix: signPrefix(sign),
  };
}

/** LEG sign of one posting leg, from its account type and its debit or credit role. */
export function postingFlowSignOf(account: EnrichedJournal['accounts'][number]): FlowSign {
  const transactionType = transactionTypeForRole(account.role);
  return transactionType ? legSign(account.accountType, transactionType) : 0;
}

/**
 * Fallback FLOW sign when no posting legs are loaded (journal-only rows). The
 * stored type is then the only signal.
 */
export function displayTypeFlowSign(displayType: JournalDisplayType | undefined): FlowSign {
  if (displayType === JournalDisplayType.INCOME) return 1;
  if (displayType === JournalDisplayType.EXPENSE) return -1;
  return 0;
}

/**
 * FLOW sign of a whole journal, from its income and expense legs. A leg without
 * a usable journal-currency amount uses the journal total instead.
 */
export function journalFlowSignOf(journal: EnrichedJournal): FlowSign {
  if (journal.accounts.length === 0) return displayTypeFlowSign(journal.displayType);
  const lines = journal.accounts.flatMap(account => {
    const transactionType = transactionTypeForRole(account.role);
    if (!transactionType) return [];
    return [
      {
        accountType: account.accountType,
        transactionType,
        amount: legJournalAmount(journal, account) ?? journal.totalAmount,
      },
    ];
  });
  return journalFlowSign(lines);
}

function toCardPresentation(
  displayType: JournalDisplayType,
  semanticLabel: string | undefined,
  semanticType: SemanticType | undefined,
  sign: FlowSign,
  chrome: ReturnType<typeof flowChrome>,
): JournalEntryCardProps['presentation'] {
  const presentation = journalPresenter.getPresentation(displayType, semanticLabel, semanticType);
  const hasSemanticType = semanticType != null && semanticType !== SemanticType.UNKNOWN;
  return {
    label: presentation.label,
    showTypeBadge: hasSemanticType
      ? !ROUTINE_SEMANTIC_TYPES.has(semanticType)
      : !ROUTINE_DISPLAY_TYPES.has(displayType),
    typeColor: presentation.colorKey,
    amountColorKey: signColorKey(sign),
    typeIcon: chrome.typeIcon,
    amountPrefix: chrome.amountPrefix,
  };
}

export function accountEntryLeg(
  account: {
    id: AccountId;
    name: string;
    accountType: string;
    icon?: string | null;
    color?: string;
  },
  role: JournalEntryLeg['role'],
  id: string,
): JournalEntryLeg {
  return {
    id,
    accountId: account.id,
    name: account.name,
    role,
    icon: isValidIconName(account.icon) ? account.icon : undefined,
    color: account.color,
    fallbackIcon: parseIconName(getAccountFallbackIcon(account.accountType), Icon.Wallet),
    variant: getAccountTypeVariant(account.accountType),
  };
}

/** A leg's amount in the journal currency, when its rate is known. */
function legJournalAmount(
  journal: EnrichedJournal,
  account: EnrichedJournal['accounts'][number],
): number | undefined {
  const journalPrecision = getCurrencyPrecision(journal.currencyCode);
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
  return amount != null && rate != null && currencyCode
    ? convertJournalCurrencyAmount({
        nativeAmount: amount,
        nativePrecision: getCurrencyPrecision(currencyCode),
        exchangeRate: rate,
        journalPrecision,
      }).journalAmount
    : undefined;
}

function buildAccountFlow(
  journal: EnrichedJournal,
  viewerAccount?: EnrichedJournal['accounts'][number],
): JournalEntryAccountFlow {
  const legs = journal.accounts.map((account, index) => {
    const journalAmount = legJournalAmount(journal, account);
    const leg = accountEntryLeg(
      account,
      account.role,
      account.transactionId ?? `${account.id}:${account.role}:${index}`,
    );
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
  const viewerAccount = viewerLegOf(journal, viewer);
  // The same cash-flow sign for every view: the viewed leg in account views,
  // the journal's income and expense net otherwise.
  const sign = viewerAccount ? postingFlowSignOf(viewerAccount) : journalFlowSignOf(journal);
  const chrome = flowChrome(sign, displayType);

  return {
    title: journal.description || defaultTitle,
    amount: viewerAccount?.amount ?? journal.totalAmount,
    currencyCode: viewerAccount?.currencyCode || journal.currencyCode,
    transactionDate: journal.journalDate,
    presentation: toCardPresentation(
      displayType,
      journal.semanticLabel,
      journal.semanticType,
      sign,
      chrome,
    ),
    accountFlow: buildAccountFlow(journal, viewerAccount),
    notes: journal.notes,
  };
}
