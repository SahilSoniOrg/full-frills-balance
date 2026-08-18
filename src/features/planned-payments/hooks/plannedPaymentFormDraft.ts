import {
  AccountId,
  EMPTY_ACCOUNT_ID,
  PlainPlannedPayment,
  PlannedPaymentId,
  PlannedPaymentInterval,
} from '@/src/types/domain';

export interface PlannedPaymentFormState {
  name: string;
  amount: string;
  currencyCode: string;
  fromAccountId: AccountId;
  toAccountId: AccountId;
  intervalN: number;
  intervalType: PlannedPaymentInterval;
  startDate: number;
  endDate?: number;
  isAutoPost: boolean;
  recurrenceDay?: number;
  recurrenceMonth?: number;
}

export function createEmptyPlannedPaymentForm(currencyCode: string): PlannedPaymentFormState {
  return {
    name: '',
    amount: '',
    currencyCode,
    fromAccountId: EMPTY_ACCOUNT_ID,
    toAccountId: EMPTY_ACCOUNT_ID,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    startDate: Date.now(),
    isAutoPost: false,
    recurrenceDay: new Date().getDate(),
    recurrenceMonth: undefined,
  };
}

export function mapPlannedPaymentToForm(pp: PlainPlannedPayment): PlannedPaymentFormState {
  return {
    name: pp.name,
    amount: pp.amount.toString(),
    currencyCode: pp.currencyCode,
    fromAccountId: pp.fromAccountId,
    toAccountId: pp.toAccountId || EMPTY_ACCOUNT_ID,
    intervalN: pp.intervalN,
    intervalType: pp.intervalType,
    startDate: pp.startDate,
    endDate: pp.endDate,
    isAutoPost: pp.isAutoPost,
    recurrenceDay: pp.recurrenceDay,
    recurrenceMonth: pp.recurrenceMonth,
  };
}

/**
 * Seed once per planned-payment id when the observed record first arrives.
 * Later observe ticks must NOT re-seed (preserves dirty draft).
 */
export function shouldSeedPlannedPaymentDraft(args: {
  id: string | undefined;
  seededId: string | null;
  item: PlainPlannedPayment | null;
}): boolean {
  const { id, seededId, item } = args;
  if (!id || !item) return false;
  if (item.id !== (id as PlannedPaymentId)) return false;
  return seededId !== id;
}
