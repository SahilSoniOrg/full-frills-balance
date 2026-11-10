import { AccountFields } from '@/src/types/plainDtos';
import type { AccountId } from '@/src/types/ids';
import type { TransactionInboxItem } from '@/src/types/domainJournal';
import type { SmsAccountRecognition, SmsRecognitionSummary } from '@/src/types/accountMatcher';
import { getEligibleMatcherAccountIds } from '@/src/services/accounts/accountMatcherEligibility';
import { resolveAccountFlowRoles } from '@/src/services/sms/recognition/accountFlowRoles';
import { summarizeSmsRecognition } from '@/src/services/sms/recognition/smsRecognitionSummary';
import { classifyCapture } from '@/src/domain/transaction-intelligence/captureDecision';
import { extractMessageEconomicEvidence } from '@/src/domain/transaction-intelligence/messageEconomicEvidence';

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

function fuzzyParsedAccountId(
  item: TransactionInboxItem,
  accounts: AccountFields[],
  financialIds: ReadonlySet<AccountId>,
): AccountId | undefined {
  if (!item.parsedAccountSource) return undefined;
  const hint = normalize(item.parsedAccountSource);
  const digits = item.parsedAccountSource.match(/(\d{3,6})/)?.[1];
  const candidates = accounts.filter(
    account =>
      financialIds.has(account.id) &&
      ((digits &&
        ((account.name || '').includes(digits) || (account.description || '').includes(digits))) ||
        (hint &&
          (normalize(account.name).includes(hint) ||
            normalize(account.description).includes(hint)))),
  );
  return candidates.length === 1 ? candidates[0].id : undefined;
}

/** Build manual review suggestions from shared capture classification. */
export function prepareTransactionInboxImport(
  item: TransactionInboxItem,
  accounts: AccountFields[],
  options: TransactionInboxImportDecision,
): TransactionInboxImportPlan {
  const financialIds = getEligibleMatcherAccountIds(accounts);
  const recognition = options.recognition;
  const summary = summarizeSmsRecognition(recognition);
  const roles = resolveAccountFlowRoles(recognition);
  const direction =
    item.direction === 'credit' || item.direction === 'debit' ? item.direction : 'unknown';
  const eligibleRecognition =
    !summary.hold &&
    recognition.status !== 'indeterminate' &&
    recognition.accountIds.every(id => financialIds.has(id));

  let sourceAccountId: AccountId | undefined;
  let destinationAccountId: AccountId | undefined;
  let type: 'expense' | 'income' | 'transfer' = direction === 'credit' ? 'income' : 'expense';

  if (eligibleRecognition) {
    const classification = classifyCapture(
      extractMessageEconomicEvidence(item.rawBody ?? ''),
      direction,
      {
        status: recognition.status,
        accountIds: recognition.accountIds,
        outgoingAccountId: roles.sourceAccountId,
        incomingAccountId: roles.destinationAccountId,
        ambiguous: roles.isAmbiguous || !!summary.hold,
      },
    );
    if (classification.kind !== 'review') {
      type = classification.kind;
      if (classification.kind === 'transfer') {
        sourceAccountId = classification.sourceAccountId;
        destinationAccountId = classification.destinationAccountId;
      } else if (classification.kind === 'expense') {
        sourceAccountId = classification.sourceAccountId;
      } else {
        destinationAccountId = classification.sourceAccountId;
      }
    } else if (recognition.flows?.length) {
      // Declared flows still suggest legs for the form when classification holds for review.
      if (!roles.isAmbiguous) {
        sourceAccountId = roles.sourceAccountId;
        destinationAccountId = roles.destinationAccountId;
      }
      if (
        sourceAccountId &&
        destinationAccountId &&
        financialIds.has(sourceAccountId) &&
        financialIds.has(destinationAccountId)
      )
        type = 'transfer';
      else if (destinationAccountId && financialIds.has(destinationAccountId)) type = 'income';
    } else {
      const bankAccountId =
        recognition.status === 'recognized' && recognition.accountIds.length === 1
          ? recognition.accountIds[0]
          : recognition.status === 'none'
            ? fuzzyParsedAccountId(item, accounts, financialIds)
            : undefined;
      if (item.direction === 'credit') destinationAccountId = bankAccountId;
      else if (item.direction === 'debit') sourceAccountId = bankAccountId;
      if (destinationAccountId && financialIds.has(destinationAccountId) && !sourceAccountId)
        type = 'income';
    }
  }

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
