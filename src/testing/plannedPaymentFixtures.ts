import { accountWriteRepository } from '@/src/data/repositories/account';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import type {
  PlannedPaymentObligation,
  PlannedPaymentSavedOccurrence,
} from '@/src/services/planned-payment/plannedPaymentReadService';
import { AccountType, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import type { PlannedPaymentFxMode } from '@/src/types/plannedPaymentFx';
import type PlannedPayment from '@/src/data/models/PlannedPayment';
import { resetDatabase } from '@/src/testing/resetDatabase';

export async function seedPlannedPaymentWorkplace(workplaceId: WorkplaceId) {
  await resetDatabase();
  const from = await accountWriteRepository.create({
    name: 'Checking',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId,
  });
  const to = await accountWriteRepository.create({
    name: 'Rent',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
    workplaceId,
  });
  return { fromAccountId: from.id, toAccountId: to.id };
}

export async function seedPlannedPaymentFxWorkplace(workplaceId: WorkplaceId) {
  await resetDatabase();
  const from = await accountWriteRepository.create({
    name: 'USD source',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    workplaceId,
  });
  const to = await accountWriteRepository.create({
    name: 'EUR destination',
    accountType: AccountType.ASSET,
    currencyCode: 'EUR',
    workplaceId,
  });
  return { fromAccountId: from.id, toAccountId: to.id };
}

export function fixturePlannedPaymentDate(month: number, day: number, year = 2026, hour = 0) {
  return new Date(year, month - 1, day, hour).getTime();
}

export function fixturePlannedPaymentObligation(
  overrides: Partial<PlannedPaymentObligation> = {},
): PlannedPaymentObligation {
  return {
    id: 'plan' as PlannedPaymentId,
    name: 'Rent',
    amount: 100,
    currencyCode: 'USD',
    fromAccountId: 'cash' as AccountId,
    toAccountId: 'rent' as AccountId,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.MONTHLY,
    recurrenceDay: 31,
    startDate: fixturePlannedPaymentDate(1, 31),
    nextOccurrence: fixturePlannedPaymentDate(1, 31),
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: false,
    flowDirection: 'outflow',
    ...overrides,
  };
}

export function fixturePlannedPaymentObligationWithId(
  id: string,
  overrides: Partial<PlannedPaymentObligation> = {},
): PlannedPaymentObligation {
  return fixturePlannedPaymentObligation({ id: id as PlannedPaymentId, name: id, ...overrides });
}

export function fixturePlannedPaymentSaved(
  day: number,
  overrides: Partial<PlannedPaymentSavedOccurrence> = {},
  month = 1,
  year = 2026,
): PlannedPaymentSavedOccurrence {
  return {
    plannedPaymentId: 'plan' as PlannedPaymentId,
    journalId: `entry-${day}` as JournalId,
    date: fixturePlannedPaymentDate(month, day, year),
    amount: 75,
    currencyCode: 'EUR',
    ...overrides,
  };
}

export function fixturePlannedPaymentSavedForPlan(
  journalId: string,
  planId: string,
  due: number,
  amount = 100,
  currencyCode = 'USD',
): PlannedPaymentSavedOccurrence {
  return {
    journalId: journalId as JournalId,
    plannedPaymentId: planId as PlannedPaymentId,
    date: due,
    amount,
    currencyCode,
  };
}

export async function createDuePlannedPayment(
  workplaceId: WorkplaceId,
  fromAccountId: AccountId,
  toAccountId: AccountId,
  options: { name?: string; amount?: number; isAutoPost?: boolean } = {},
): Promise<PlannedPayment> {
  const occurrence = normalizeToStartOfDay(Date.now());
  return plannedPaymentRepository.create(workplaceId, {
    name: options.name ?? 'Rent',
    amount: options.amount ?? 1200,
    currencyCode: 'USD',
    fromAccountId,
    toAccountId,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.DAILY,
    startDate: occurrence,
    endDate: occurrence,
    nextOccurrence: occurrence,
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: options.isAutoPost ?? false,
  });
}

export async function createPlannedFxPayment(
  workplaceId: WorkplaceId,
  fromAccountId: AccountId,
  toAccountId: AccountId,
  mode?: PlannedPaymentFxMode,
  options: {
    auto?: boolean;
    amount?: number;
    destinationAmount?: number;
    date?: number;
  } = {},
): Promise<PlannedPayment> {
  const date = options.date ?? normalizeToStartOfDay(Date.now());
  return plannedPaymentRepository.create(workplaceId, {
    name: 'FX transfer',
    amount: options.amount ?? 100,
    currencyCode: 'USD',
    fxMode: mode,
    destinationAmount: options.destinationAmount,
    fromAccountId,
    toAccountId,
    intervalN: 1,
    intervalType: PlannedPaymentInterval.DAILY,
    startDate: date,
    endDate: date,
    nextOccurrence: date,
    status: PlannedPaymentStatus.ACTIVE,
    isAutoPost: options.auto ?? false,
  });
}
