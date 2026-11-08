import { AccountFields } from '@/src/types/plainDtos';
import type { AccountId } from '@/src/types/ids';
import type { TransactionInboxItem } from '@/src/types/domainJournal';
import type { SmsAccountRecognition, SmsRecognitionSummary } from '@/src/types/accountMatcher';
import { getEligibleMatcherAccountIds } from '@/src/services/accounts/accountMatcherEligibility';
import { resolveAccountFlowRoles } from '@/src/services/sms/recognition/accountFlowRoles';
import { summarizeSmsRecognition } from '@/src/services/sms/recognition/smsRecognitionSummary';

export interface TransactionInboxImportOptions {
  mode?: 'simple' | 'split' | 'advanced';
}
export interface TransactionInboxImportDecision extends TransactionInboxImportOptions {
  recognition: SmsAccountRecognition;
}
export interface TransactionInboxImportNavigation {
  smsId?: string;
  smsRecordId: string;
  initialDate: string;
  params: Record<string, string>;
}
export interface TransactionInboxImportPlan {
  navigation: TransactionInboxImportNavigation;
  recognition: SmsRecognitionSummary;
}

function normalize(value?: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Build manual review suggestions from current account recognition. */
export function prepareTransactionInboxImport(
  item: TransactionInboxItem,
  accounts: AccountFields[],
  options: TransactionInboxImportDecision,
): TransactionInboxImportPlan {
  const financialIds = getEligibleMatcherAccountIds(accounts);
  const recognition = options.recognition;
  const summary = summarizeSmsRecognition(recognition);
  const roles = resolveAccountFlowRoles(recognition);
  let sourceAccountId: AccountId | undefined;
  let destinationAccountId: AccountId | undefined;

  if (
    !summary.hold &&
    recognition.status !== 'indeterminate' &&
    recognition.accountIds.every(id => financialIds.has(id))
  ) {
    if (recognition.flows?.length) {
      sourceAccountId = roles.sourceAccountId;
      destinationAccountId = roles.destinationAccountId;
    } else {
      let bankAccountId =
        recognition.status === 'recognized' && recognition.accountIds.length === 1
          ? recognition.accountIds[0]
          : undefined;
      if (!bankAccountId && recognition.status === 'none' && item.parsedAccountSource) {
        const hint = normalize(item.parsedAccountSource);
        const digits = item.parsedAccountSource.match(/(\d{3,6})/)?.[1];
        const candidates = accounts.filter(
          account =>
            financialIds.has(account.id) &&
            ((digits &&
              ((account.name || '').includes(digits) ||
                (account.description || '').includes(digits))) ||
              (hint &&
                (normalize(account.name).includes(hint) ||
                  normalize(account.description).includes(hint)))),
        );
        if (candidates.length === 1) bankAccountId = candidates[0].id;
      }
      if (item.direction === 'credit') destinationAccountId = bankAccountId;
      else if (item.direction === 'debit') sourceAccountId = bankAccountId;
    }
  }
  const type: 'expense' | 'income' | 'transfer' =
    sourceAccountId &&
    destinationAccountId &&
    financialIds.has(sourceAccountId) &&
    financialIds.has(destinationAccountId)
      ? 'transfer'
      : destinationAccountId && financialIds.has(destinationAccountId)
        ? 'income'
        : item.direction === 'credit'
          ? 'income'
          : 'expense';

  const params: Record<string, string> = {
    type,
    amount: item.parsedAmount != null ? String(item.parsedAmount) : '',
    ...(item.parsedCurrencyCode ? { currencyCode: item.parsedCurrencyCode } : {}),
    description:
      item.parsedMerchant?.trim() ||
      `${type.charAt(0).toUpperCase() + type.slice(1)} via ${item.channel === 'voice' ? 'voice' : item.channel === 'email' ? 'email' : 'SMS'}`,
    notes: item.channel === 'voice' ? `Spoken transcript: ${item.rawBody || ''}` : '',
    ...(options.mode ? { mode: options.mode } : {}),
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
    recognition: summary,
  };
}
