import type { AccountFields } from '@/src/types/domain';
import { AppConfig } from '@/src/constants/app-config';
import {
  AccountId,
  EMPTY_ACCOUNT_ID,
  PlainSmsRule,
  TransactionInboxItem,
} from '@/src/types/domain';

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
    bankAccountId = bestAccount?.id as AccountId | undefined;
  }

  if (!counterpartyId && item.parsedMerchant) {
    const normalizedMerchant = normalizeForMatch(item.parsedMerchant);
    const bestAccount = accounts.find(account => {
      const name = normalizeForMatch(account.name);
      return name.includes(normalizedMerchant) || normalizedMerchant.includes(name);
    });
    if (bestAccount && bestAccount.id !== bankAccountId) {
      counterpartyId = bestAccount.id as AccountId;
    }
  }

  return { bankAccountId, counterpartyId, customDescription };
}

function buildNotes(item: TransactionInboxItem, customDescription?: string): string {
  if (customDescription?.trim()) {
    return customDescription
      .trim()
      .replace(/{merchant}/gi, item.parsedMerchant || 'Unknown Merchant')
      .replace(/{amount}/gi, item.parsedAmount != null ? String(item.parsedAmount) : '0.00')
      .replace(/{ref}/gi, item.referenceNumber || '')
      .replace(/{sender}/gi, item.senderAddress || '')
      .replace(/\\n/g, '\n');
  }
  if (item.channel === 'voice') return `Spoken transcript: ${item.rawBody}`;
  if (item.channel === 'sms') {
    return `Imported from SMS: ${item.parsedMerchant || item.senderAddress}${item.referenceNumber ? `\nRef: ${item.referenceNumber}` : ''}\n\n${(item.rawBody || '').substring(0, AppConfig.input.sms.previewBodyChars)}...`;
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
    amount: String(item.parsedAmount || ''),
    notes: buildNotes(item, customDescription),
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
