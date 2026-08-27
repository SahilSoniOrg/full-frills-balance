import { AccountFields, PlainSmsRule } from '@/src/types/plainDtos';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { TransactionInboxItem } from '@/src/types/domainJournal';

export interface TransactionInboxImportOptions {
  mode?: 'simple' | 'split' | 'advanced';
}

export interface TransactionInboxImportNavigation {
  smsId?: string;
  smsRecordId: string;
  smsSender?: string;
  rawSmsBody: string;
  initialDate: string;
  params: Record<string, string>;
}

function normalizeForMatch(value?: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveRuleAccounts(
  item: TransactionInboxItem,
  accounts: AccountFields[],
  matchedRule: PlainSmsRule | null,
): { bankAccountId?: AccountId; counterpartyId?: AccountId; customDescription?: string } {
  let bankAccountId = matchedRule?.sourceAccountId;
  let counterpartyId = matchedRule?.categoryAccountId;

  if (bankAccountId === EMPTY_ACCOUNT_ID) bankAccountId = undefined;
  if (counterpartyId === EMPTY_ACCOUNT_ID) counterpartyId = undefined;

  let customDescription: string | undefined;
  if (matchedRule?.actionsJson) {
    try {
      const actions: unknown = JSON.parse(matchedRule.actionsJson);
      if (
        typeof actions === 'object' &&
        actions !== null &&
        'journalDescription' in actions &&
        typeof actions.journalDescription === 'string'
      ) {
        customDescription = actions.journalDescription;
      }
    } catch {
      // Optional rule actions are best-effort metadata.
    }
  }

  if (!bankAccountId && item.parsedAccountSource) {
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
      if (isCredit) {
        return account.accountType !== AccountType.EXPENSE;
      }
      return account.accountType !== AccountType.INCOME;
    });
    const normalizedMerchant = normalizeForMatch(item.parsedMerchant);
    const bestAccount = compatibleAccounts.find(account => {
      const name = normalizeForMatch(account.name);
      return name.includes(normalizedMerchant) || normalizedMerchant.includes(name);
    });
    if (bestAccount && bestAccount.id !== bankAccountId) {
      counterpartyId = bestAccount.id;
    }
  }

  return { bankAccountId, counterpartyId, customDescription };
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
  if (item.senderAddress?.trim()) return item.senderAddress.trim();
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function buildNotes(item: TransactionInboxItem): string {
  if (item.channel === 'voice') return `Spoken transcript: ${item.rawBody}`;
  if (item.channel === 'sms') {
    return `Imported from SMS: ${item.parsedMerchant || item.senderAddress}${item.referenceNumber ? `\nRef: ${item.referenceNumber}` : ''}`;
  }
  return `Imported from ${item.channel}: ${item.parsedMerchant || item.senderAddress}\n\n${(item.rawBody || '').substring(0, 100)}...`;
}

export function buildTransactionInboxImportNavigation(
  item: TransactionInboxItem,
  accounts: AccountFields[],
  matchedRule: PlainSmsRule | null,
  options?: TransactionInboxImportOptions,
): TransactionInboxImportNavigation {
  const { bankAccountId, counterpartyId, customDescription } = resolveRuleAccounts(
    item,
    accounts,
    matchedRule,
  );
  const type: 'expense' | 'income' | 'transfer' =
    bankAccountId && counterpartyId
      ? 'transfer'
      : item.direction === 'credit'
        ? 'income'
        : 'expense';
  const params: Record<string, string> = {
    type,
    amount: item.parsedAmount != null ? String(item.parsedAmount) : '',
    description: buildDescription(item, type, customDescription),
    notes: buildNotes(item),
    ...(options?.mode ? { mode: options.mode } : {}),
  };

  if (item.direction === 'debit') {
    if (bankAccountId) params.sourceAccountId = bankAccountId;
    if (counterpartyId) params.destinationAccountId = counterpartyId;
  } else {
    if (counterpartyId) params.sourceAccountId = counterpartyId;
    if (bankAccountId) params.destinationAccountId = bankAccountId;
  }

  return {
    smsId: item.channel === 'sms' ? item.deviceSourceId : undefined,
    smsRecordId: item.id,
    smsSender: item.senderAddress,
    rawSmsBody: item.rawBody || '',
    initialDate: new Date(item.inputDate).toISOString(),
    params,
  };
}
