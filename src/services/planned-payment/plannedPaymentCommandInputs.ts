import { AccountId } from '@/src/types/ids';
import { PlannedPaymentInterval } from '@/src/types/enums';
import type { PlannedPaymentFxFields } from '@/src/types/plannedPaymentFx';
import type Account from '@/src/data/models/Account';

/** Caller-owned fields for creating or updating a planned payment (form data only). */
export interface PlannedPaymentCommandInput extends PlannedPaymentFxFields {
  name: string;
  description?: string;
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

/** Run inside the write after resolving account references. Never reinterpret legacy currency. */
export function normalizePlannedPaymentCommandInput(
  input: PlannedPaymentCommandInput,
  accounts: readonly Pick<Account, 'id' | 'currencyCode'>[],
  existing?: PlannedPaymentFxFields &
    Partial<Pick<PlannedPaymentCommandInput, 'fromAccountId' | 'toAccountId'>>,
): PlannedPaymentCommandInput {
  const accountsChanged =
    (existing?.fromAccountId !== undefined && existing.fromAccountId !== input.fromAccountId) ||
    (existing?.toAccountId !== undefined && existing.toAccountId !== input.toAccountId);
  const fxMode = input.fxMode ?? existing?.fxMode ?? (accountsChanged ? 'automatic' : undefined);
  if (fxMode === undefined) return input;
  if (fxMode !== 'automatic' && fxMode !== 'fixed' && fxMode !== 'manual') {
    throw new Error('Choose a valid planned payment FX mode.');
  }
  if (!input.fromAccountId?.trim() || !input.toAccountId?.trim()) {
    throw new Error('Choose a From account and a To account.');
  }
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('From and To accounts must be different.');
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Enter a positive source amount.');
  }
  const source = accounts.find(account => account.id === input.fromAccountId);
  if (!source?.currencyCode) throw new Error('Planned payment requires a From account currency.');
  const destination = accounts.find(account => account.id === input.toAccountId);
  const destinationAmount =
    fxMode === 'automatic'
      ? undefined
      : destination?.currencyCode === source.currencyCode
        ? input.amount
        : Object.prototype.hasOwnProperty.call(input, 'destinationAmount')
          ? input.destinationAmount
          : existing?.fxMode === fxMode
            ? (existing.destinationAmount ?? undefined)
            : undefined;
  if (
    fxMode === 'fixed' &&
    (destinationAmount === undefined ||
      !Number.isFinite(destinationAmount) ||
      destinationAmount <= 0)
  ) {
    throw new Error('Enter a positive destination amount for fixed FX.');
  }
  if (
    fxMode === 'manual' &&
    destinationAmount !== undefined &&
    (!Number.isFinite(destinationAmount) || destinationAmount <= 0)
  ) {
    throw new Error('Enter a positive destination amount suggestion.');
  }
  return {
    ...input,
    fxMode,
    destinationAmount,
    currencyCode: source.currencyCode,
    isAutoPost: fxMode === 'manual' ? false : input.isAutoPost,
  };
}
