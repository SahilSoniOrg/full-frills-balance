import { AccountFields, PlainSmsRule } from '@/src/types/plainDtos';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { AccountType, TransactionDirection } from '@/src/types/enums';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import type {
  RuleCompatibility,
  SmsAccountRecognition,
  SmsRecognitionSummary,
} from '@/src/types/accountMatcher';
import { getEligibleMatcherAccountIds } from '@/src/services/accounts/accountMatcherEligibility';
import { isBalanceSheetAccount } from '@/src/utils/accountCategory';
import { toTransactionDirection } from '@/src/services/ledger/SmsParser';
import {
  resolveAccountFlowRoles,
  type AccountFlowRoles,
} from '@/src/services/sms/recognition/accountFlowRoles';
import { checkRuleCompatibility } from '@/src/services/sms/recognition/accountRuleCompatibility';
import { summarizeSmsRecognition } from '@/src/services/sms/recognition/smsRecognitionSummary';

export interface TransactionInboxImportOptions {
  mode?: 'simple' | 'split' | 'advanced';
  /** Fresh recognition, or a stored summary when outcomes are no longer available. */
  recognition?: SmsAccountRecognition | SmsRecognitionSummary;
}

export interface TransactionInboxImportNavigation {
  smsId?: string;
  smsRecordId: string;
  initialDate: string;
  params: Record<string, string>;
}

export interface TransactionInboxImportPlan {
  navigation: TransactionInboxImportNavigation;
  recognition?: SmsRecognitionSummary;
}

function normalizeForMatch(value?: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveRuleAccounts(
  item: TransactionInboxItem,
  accounts: AccountFields[],
  matchedRule: PlainSmsRule | null,
  recognition?: Pick<SmsAccountRecognition, 'status' | 'accountIds'>,
): { bankAccountId?: AccountId; counterpartyId?: AccountId } {
  let bankAccountId = matchedRule?.sourceAccountId;
  let counterpartyId = matchedRule?.categoryAccountId;

  if (bankAccountId === EMPTY_ACCOUNT_ID) bankAccountId = undefined;
  if (counterpartyId === EMPTY_ACCOUNT_ID) counterpartyId = undefined;

  const uniqueRecognizedAccountId =
    recognition?.status === 'recognized' && recognition.accountIds.length === 1
      ? recognition.accountIds[0]
      : undefined;
  const recognitionBlocksFuzzyFallback =
    recognition?.status === 'indeterminate' ||
    (recognition?.status === 'recognized' && recognition.accountIds.length > 1);

  if (!bankAccountId && uniqueRecognizedAccountId) {
    bankAccountId = uniqueRecognizedAccountId;
  } else if (!bankAccountId && !recognitionBlocksFuzzyFallback && item.parsedAccountSource) {
    const normalizedSource = normalizeForMatch(item.parsedAccountSource);
    const sourceDigits = item.parsedAccountSource.match(/(\d{3,6})/)?.[1];
    const bestAccount = accounts.find(account => {
      const name = normalizeForMatch(account.name);
      const description = normalizeForMatch(account.description);
      if (
        sourceDigits &&
        ((account.name || '').includes(sourceDigits) ||
          (account.description || '').includes(sourceDigits))
      ) {
        return true;
      }
      return name.includes(normalizedSource) || description.includes(normalizedSource);
    });
    bankAccountId = bestAccount?.id;
  }

  if (!counterpartyId && item.parsedMerchant) {
    const isCredit = item.direction === 'credit';
    const compatibleAccounts = accounts.filter(account => {
      return account.accountType === (isCredit ? AccountType.INCOME : AccountType.EXPENSE);
    });
    const normalizedMerchant = normalizeForMatch(item.parsedMerchant);
    const bestAccount = compatibleAccounts.find(account => {
      const name = normalizeForMatch(account.name);
      if (!normalizedMerchant || !name) return false;
      return name.includes(normalizedMerchant) || normalizedMerchant.includes(name);
    });
    if (bestAccount && bestAccount.id !== bankAccountId) {
      counterpartyId = bestAccount.id;
    }
  }

  return { bankAccountId, counterpartyId };
}

function ruleDescription(matchedRule: PlainSmsRule | null): string | undefined {
  if (matchedRule?.actionsJson) {
    try {
      const actions: unknown = JSON.parse(matchedRule.actionsJson);
      if (
        typeof actions === 'object' &&
        actions !== null &&
        'journalDescription' in actions &&
        typeof actions.journalDescription === 'string'
      ) {
        return actions.journalDescription;
      }
    } catch {
      // Optional rule actions are best-effort metadata.
    }
  }
}

interface ImportAccountRoles {
  sourceAccountId?: AccountId;
  destinationAccountId?: AccountId;
}

interface ExplicitRuleAccounts {
  sourceAccountId?: AccountId;
  categoryAccountId?: AccountId;
}

function namedAccount(id?: AccountId | null): AccountId | undefined {
  return id && id !== EMPTY_ACCOUNT_ID ? id : undefined;
}

function toAccountRecognition(
  recognition: SmsAccountRecognition | SmsRecognitionSummary,
): SmsAccountRecognition {
  if ('outcomes' in recognition) return recognition;
  return {
    status: recognition.status,
    accountIds: [...recognition.accountIds],
    outcomes: [],
    ...(recognition.flows?.length ? { flows: recognition.flows } : {}),
  };
}

function explicitRuleAccounts(matchedRule: PlainSmsRule | null): ExplicitRuleAccounts {
  return {
    sourceAccountId: namedAccount(matchedRule?.sourceAccountId),
    categoryAccountId: namedAccount(matchedRule?.categoryAccountId),
  };
}

/**
 * Places an already-resolved flow and an explicit rule mapping on journal legs.
 * Contradictions are whatever `checkRuleCompatibility` already returned.
 */
function mapResolvedFlowAccounts(
  direction: TransactionDirection,
  rule: ExplicitRuleAccounts,
  roles: AccountFlowRoles,
  compatibility: RuleCompatibility | undefined,
): ImportAccountRoles {
  if (compatibility === 'contradictory' || compatibility === 'indeterminate' || roles.isAmbiguous) {
    return {};
  }
  if (direction !== TransactionDirection.DEBIT && direction !== TransactionDirection.CREDIT) {
    return {
      sourceAccountId: roles.sourceAccountId,
      destinationAccountId: roles.destinationAccountId,
    };
  }
  const ruleSource =
    direction === TransactionDirection.DEBIT ? rule.sourceAccountId : rule.categoryAccountId;
  const ruleDestination =
    direction === TransactionDirection.DEBIT ? rule.categoryAccountId : rule.sourceAccountId;
  return {
    sourceAccountId: ruleSource ?? roles.sourceAccountId,
    destinationAccountId: ruleDestination ?? roles.destinationAccountId,
  };
}

function orientBankAndCounterparty(
  direction: TransactionInboxItem['direction'],
  bankAccountId?: AccountId,
  counterpartyId?: AccountId,
): ImportAccountRoles {
  return direction === 'debit'
    ? { sourceAccountId: bankAccountId, destinationAccountId: counterpartyId }
    : { sourceAccountId: counterpartyId, destinationAccountId: bankAccountId };
}

function expandDescriptionTemplate(template: string, item: TransactionInboxItem): string {
  return template
    .trim()
    .replace(/{merchant}/gi, item.parsedMerchant || 'Unknown Merchant')
    .replace(/{amount}/gi, item.parsedAmount != null ? String(item.parsedAmount) : '0.00')
    .replace(/{ref}/gi, item.referenceNumber || '')
    .replace(/{sender}/gi, item.senderAddress || '')
    .replace(/\\n/g, '\n');
}

function buildDescription(
  item: TransactionInboxItem,
  type: 'expense' | 'income' | 'transfer',
  customDescription?: string,
): string {
  if (customDescription?.trim()) return expandDescriptionTemplate(customDescription, item);
  if (item.parsedMerchant?.trim()) return item.parsedMerchant.trim();
  return `${type.charAt(0).toUpperCase() + type.slice(1)} via SMS`;
}

export function prepareTransactionInboxImport(
  item: TransactionInboxItem,
  accounts: AccountFields[],
  matchedRule: PlainSmsRule | null,
  options?: TransactionInboxImportOptions,
): TransactionInboxImportPlan {
  const financialLeaves = getEligibleMatcherAccountIds(accounts);
  const isBalanceSheetLeg = (id?: AccountId) => {
    const account = accounts.find(candidate => candidate.id === id);
    return !!account && isBalanceSheetAccount(account.accountType);
  };
  const recognition = options?.recognition ? toAccountRecognition(options.recognition) : undefined;
  const direction = toTransactionDirection(item.direction);
  const ruleAccounts = explicitRuleAccounts(matchedRule);
  const hasRuleAccounts = !!(ruleAccounts.sourceAccountId || ruleAccounts.categoryAccountId);
  const compatibility =
    recognition && hasRuleAccounts
      ? checkRuleCompatibility(recognition, ruleAccounts, id => financialLeaves.has(id), direction)
      : undefined;
  const recognitionSummary = recognition
    ? summarizeSmsRecognition(recognition, compatibility)
    : undefined;

  let selectedAccounts: ImportAccountRoles;
  if (!recognition) {
    const { bankAccountId, counterpartyId } = resolveRuleAccounts(item, accounts, matchedRule);
    selectedAccounts = orientBankAndCounterparty(item.direction, bankAccountId, counterpartyId);
  } else if (recognition.flows?.length) {
    selectedAccounts = mapResolvedFlowAccounts(
      direction,
      ruleAccounts,
      resolveAccountFlowRoles(recognition),
      compatibility,
    );
  } else if (recognitionSummary?.hold || recognitionSummary?.status === 'indeterminate') {
    selectedAccounts = {};
  } else {
    const { bankAccountId, counterpartyId } = resolveRuleAccounts(
      item,
      accounts,
      matchedRule,
      recognition,
    );
    selectedAccounts = orientBankAndCounterparty(item.direction, bankAccountId, counterpartyId);
  }
  const { sourceAccountId, destinationAccountId } = selectedAccounts;
  const type: 'expense' | 'income' | 'transfer' =
    isBalanceSheetLeg(sourceAccountId) && isBalanceSheetLeg(destinationAccountId)
      ? 'transfer'
      : recognition?.flows?.length && (sourceAccountId || destinationAccountId)
        ? !!destinationAccountId && financialLeaves.has(destinationAccountId)
          ? 'income'
          : 'expense'
        : item.direction === 'credit'
          ? 'income'
          : 'expense';
  const params: Record<string, string> = {
    type,
    amount: item.parsedAmount != null ? String(item.parsedAmount) : '',
    ...(item.parsedCurrencyCode ? { currencyCode: item.parsedCurrencyCode } : {}),
    description: buildDescription(item, type, ruleDescription(matchedRule)),
    notes:
      item.channel === 'sms'
        ? ''
        : item.channel === 'voice'
          ? `Spoken transcript: ${item.rawBody}`
          : `Imported from ${item.channel}: ${item.parsedMerchant || item.senderAddress}\n\n${(item.rawBody || '').substring(0, 100)}...`,
    ...(options?.mode ? { mode: options.mode } : {}),
  };

  if (sourceAccountId) params.sourceAccountId = sourceAccountId;
  if (destinationAccountId) params.destinationAccountId = destinationAccountId;

  return {
    navigation: {
      smsId: item.channel === 'sms' ? item.deviceSourceId : undefined,
      smsRecordId: item.id,
      initialDate: new Date(item.inputDate).toISOString(),
      params,
    },
    ...(recognitionSummary ? { recognition: recognitionSummary } : {}),
  };
}

export function buildTransactionInboxImportNavigation(
  item: TransactionInboxItem,
  accounts: AccountFields[],
  matchedRule: PlainSmsRule | null,
  options?: TransactionInboxImportOptions,
): TransactionInboxImportNavigation {
  return prepareTransactionInboxImport(item, accounts, matchedRule, options).navigation;
}
