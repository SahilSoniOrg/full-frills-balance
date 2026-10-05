import { createInitialDraft, type CashClarityDraft } from '../draft';
import { AccountType, PlannedPaymentInterval } from '@/src/types/enums';
import { asWorkplaceId } from '@/src/types/ids';
import dayjs from 'dayjs';

export const cashClarityNow = dayjs('2026-09-14T10:00:00');
export const cashClarityWorkplaceId = asWorkplaceId('workplace-op');

export function cashClarityDraft(
  overrides: Partial<CashClarityDraft> = {},
  options: { defaultBalance?: number } = {},
): CashClarityDraft {
  const defaultBalance = options.defaultBalance ?? 50_000;
  return {
    ...createInitialDraft('INR', 'Personal'),
    accounts: [{ id: 'main', kind: 'bank', name: 'Bank', balance: defaultBalance }],
    income: { kind: 'skipped' },
    commitment: { kind: 'skipped' },
    budget: { kind: 'skipped' },
    ...overrides,
  };
}

export function cashClarityCommitDraft(
  overrides: Partial<CashClarityDraft> = {},
): CashClarityDraft {
  return {
    ...cashClarityDraft(overrides, { defaultBalance: 0 }),
    displayName: 'Sahil',
    ...overrides,
  };
}

export function cashClarityAccount(id: string, name: string, accountType: AccountType) {
  return { id, name, accountType, accountSubtype: 'BANK_CHECKING', currencyCode: 'INR' };
}

export const cashClaritySalaryIncome = {
  id: 'pay',
  name: 'Salary',
  source: 'salary' as const,
  amount: 40_000,
  interval: PlannedPaymentInterval.WEEKLY,
  intervalN: 2,
  nextDate: Date.parse('2026-09-25'),
};
