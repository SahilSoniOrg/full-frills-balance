import type { AccountId } from '@/src/types/ids';
import type { CreateJournalData } from '@/src/types/journalWrite';
import { buildCaptureJournal } from './buildCaptureJournal';
import {
  classifyCapture,
  type CaptureAccountEvidence,
  type EconomicEvidence,
} from './captureDecision';
import type { CaptureSourceObservation } from './captureMetadata';
import { captureDescriptionKey } from './descriptionDefaults';

export interface CaptureObservation {
  source: CaptureSourceObservation;
  direction: 'debit' | 'credit' | 'unknown';
  amount?: number;
  currencyCode?: string;
  merchant?: string;
  economicEvidence: EconomicEvidence;
  parsed: boolean;
  pending: boolean;
}

export interface CapturePolicy {
  enabled: boolean;
  enabledAt?: number;
  allowAutomaticCapture: boolean;
  sourceAccountCurrency: (id: AccountId) => string | undefined;
  isFinancialLeaf: (id: AccountId) => boolean;
  uncategorizedAccount: (kind: 'expense' | 'income', currencyCode: string) => AccountId | undefined;
  categoryDefault?: (
    merchant: string,
    financialAccountId: AccountId,
    kind: 'expense' | 'income',
    currencyCode: string,
  ) => AccountId | undefined;
  descriptionDefaults?: Readonly<Record<string, string>>;
  openMerchants?: readonly string[];
}

export type CaptureDisposition =
  { kind: 'review'; reason?: string } | { kind: 'post'; journalData: CreateJournalData };

const MAX_SOURCE_CLOCK_SKEW_MS = 5 * 60 * 1_000;

/** Shared posting authority: source adapters provide facts, never posting permission. */
export function decideCapture(
  observation: CaptureObservation,
  accounts: CaptureAccountEvidence,
  policy: CapturePolicy,
  now: number,
): CaptureDisposition {
  if (!observation.parsed || !observation.pending) return { kind: 'review' };
  const date = observation.source.occurredAt;
  if (
    !policy.allowAutomaticCapture ||
    !policy.enabled ||
    !policy.enabledAt ||
    !Number.isFinite(policy.enabledAt) ||
    policy.enabledAt <= 0 ||
    !observation.source.sourceId.trim() ||
    !Number.isFinite(date) ||
    date <= policy.enabledAt ||
    date > now + MAX_SOURCE_CLOCK_SKEW_MS
  )
    return { kind: 'review' };
  const { amount, currencyCode } = observation;
  if (
    !amount ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !currencyCode ||
    !/^[A-Z]{3}$/.test(currencyCode)
  )
    return { kind: 'review', reason: 'Review the amount and currency.' };
  const classification = classifyCapture(
    observation.economicEvidence,
    observation.direction,
    accounts,
  );
  if (classification.kind === 'review') return classification;
  if (
    !accounts.accountIds.every(
      id => policy.isFinancialLeaf(id) && policy.sourceAccountCurrency(id) === currencyCode,
    )
  ) {
    return { kind: 'review', reason: 'Review the account currency or exchange rate.' };
  }
  const uncategorizedAccountId =
    classification.kind === 'transfer'
      ? undefined
      : policy.uncategorizedAccount(classification.kind, currencyCode);
  if (classification.kind !== 'transfer' && !uncategorizedAccountId)
    return {
      kind: 'review',
      reason: 'Configure an eligible Uncategorized account for this currency.',
    };
  const merchantKey = observation.merchant?.trim().toLowerCase();
  const defaultAccountId =
    classification.kind !== 'transfer' &&
    merchantKey &&
    !policy.openMerchants?.includes(merchantKey)
      ? policy.categoryDefault?.(
          merchantKey,
          classification.sourceAccountId,
          classification.kind,
          currencyCode,
        )
      : undefined;
  const counterAccountId =
    classification.kind === 'transfer'
      ? classification.destinationAccountId
      : (defaultAccountId ?? uncategorizedAccountId);
  if (!counterAccountId) return { kind: 'review', reason: 'Resolve the counter-account.' };
  const journalData = buildCaptureJournal({
    economicKind: classification.kind,
    financialAccountId: classification.sourceAccountId,
    counterAccountId,
    uncategorizedAccountId,
    categoryOrigin: defaultAccountId ? 'default' : 'uncategorized',
    amount,
    currencyCode,
    occurredAt: date,
    merchant: observation.merchant,
    source: observation.source,
  });
  const descriptionKey = captureDescriptionKey(
    observation.merchant,
    amount,
    currencyCode,
    classification.kind,
  );
  if (merchantKey && !policy.openMerchants?.includes(merchantKey) && descriptionKey) {
    const description = policy.descriptionDefaults?.[descriptionKey];
    if (description?.trim()) journalData.description = description;
  }
  return {
    kind: 'post',
    journalData,
  };
}
