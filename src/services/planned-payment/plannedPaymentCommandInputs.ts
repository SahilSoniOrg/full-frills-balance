import { PlannedPaymentInterval } from '@/src/data/models/PlannedPayment';
import { AccountId } from '@/src/types/domain';

/** Caller-owned fields for creating or updating a planned payment (form data only). */
export interface PlannedPaymentCommandInput {
  name: string;
  amount: number;
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
