import { generator } from '@/src/data/database/idGenerator';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { AccountSubtype, AccountType, PlannedPaymentInterval } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import dayjs, { type Dayjs } from 'dayjs';
import { cashClarityWorkplaceId } from './pendingWorkplace';

export type OnboardingStep =
  'welcome' | 'you' | 'currency' | 'now' | 'next' | 'protect' | 'reserve' | 'clarity';

export type AccountKind = 'bank' | 'cash' | 'savings' | 'card';

export interface DraftAccount {
  readonly id: string;
  readonly kind: AccountKind;
  readonly name: string;
  readonly balance: number;
  /** Savings only. False means excluded from spendable liquid cash. */
  readonly spendable?: boolean;
  readonly cardPaymentAmount?: number;
  readonly cardPaymentDate?: number;
}

export type RecurringIncome = {
  readonly id: string;
  readonly name: string;
  readonly source: 'salary' | 'family' | 'retirement' | 'freelance' | 'other';
  readonly amount: number;
  readonly interval: PlannedPaymentInterval;
  readonly intervalN: number;
  readonly nextDate: number;
};

export type IncomeDraft =
  | { readonly kind: 'unset' }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'recurring'; readonly items: readonly RecurringIncome[] };

export type CommitmentKind = 'rent' | 'subscription' | 'loan' | 'utilities';

export type PaymentItem = {
  readonly id: string;
  readonly name: string;
  readonly type: CommitmentKind;
  readonly amount: number;
  readonly dueDate: number;
};

export type CommitmentDraft =
  | { readonly kind: 'unset' }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'payment'; readonly items: readonly PaymentItem[] };

export type BudgetItem = {
  readonly id: string;
  readonly name: string;
  readonly amount: number;
  /** Chip / category key used for mapping, even if the display name is edited. */
  readonly category?: string;
};

export type BudgetDraft =
  | { readonly kind: 'unset' }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'set'; readonly items: readonly BudgetItem[] };

export interface CashClarityDraft {
  readonly operationId: WorkplaceId;
  readonly displayName: string;
  readonly workplaceName: string;
  readonly workplaceIcon: IconName;
  readonly currency: string;
  readonly accounts: readonly DraftAccount[];
  readonly income: IncomeDraft;
  readonly commitment: CommitmentDraft;
  readonly budget: BudgetDraft;
}

export const ACCOUNT_KIND_META: Record<
  AccountKind,
  { readonly name: string; readonly type: AccountType; readonly icon: IconName }
> = {
  bank: { name: 'Bank', type: AccountType.ASSET, icon: Icon.Bank },
  cash: { name: 'Cash', type: AccountType.ASSET, icon: Icon.Wallet },
  savings: { name: 'Savings', type: AccountType.ASSET, icon: Icon.Safe },
  card: { name: 'Credit Card', type: AccountType.LIABILITY, icon: Icon.CreditCard },
};

export function subtypeForAccount(account: DraftAccount): AccountSubtype {
  switch (account.kind) {
    case 'cash':
      return AccountSubtype.CASH;
    case 'bank':
      return AccountSubtype.BANK_CHECKING;
    case 'savings':
      return account.spendable === false
        ? AccountSubtype.FIXED_DEPOSIT
        : AccountSubtype.BANK_SAVINGS;
    case 'card':
      return AccountSubtype.CREDIT_CARD;
  }
}

export function isSpendableAccount(account: DraftAccount): boolean {
  if (account.kind === 'card') return false;
  if (account.kind === 'savings') return account.spendable === true;
  return true;
}

export function isMoneyReady(accounts: readonly DraftAccount[]): boolean {
  if (accounts.length === 0) return false;
  return accounts.every(account => {
    if (account.kind === 'card' && account.balance <= 0) return false;
    if (account.kind === 'savings' && account.spendable !== true && account.spendable !== false) {
      return false;
    }
    return true;
  });
}

export function createInitialDraft(currency: string, workplaceName: string): CashClarityDraft {
  return {
    operationId: cashClarityWorkplaceId(),
    displayName: '',
    workplaceName,
    workplaceIcon: Icon.Home,
    currency,
    accounts: [],
    income: { kind: 'unset' },
    commitment: { kind: 'unset' },
    budget: { kind: 'unset' },
  };
}

export function nextDateOnDayOfMonth(dayOfMonth: number, from = dayjs()): Dayjs {
  const thisMonth = from.startOf('month');
  const candidate = thisMonth.date(Math.min(dayOfMonth, thisMonth.daysInMonth()));
  if (!candidate.isBefore(from.startOf('day'))) return candidate;
  const nextMonth = thisMonth.add(1, 'month');
  return nextMonth.date(Math.min(dayOfMonth, nextMonth.daysInMonth()));
}

export function incomeRecurrence(choice: 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY'): {
  readonly interval: PlannedPaymentInterval;
  readonly intervalN: number;
} {
  if (choice === 'WEEKLY') return { interval: PlannedPaymentInterval.WEEKLY, intervalN: 1 };
  if (choice === 'BIWEEKLY') return { interval: PlannedPaymentInterval.WEEKLY, intervalN: 2 };
  return { interval: PlannedPaymentInterval.MONTHLY, intervalN: 1 };
}

export function cadenceFromIncome(item: RecurringIncome): 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY' {
  if (item.interval === PlannedPaymentInterval.WEEKLY && item.intervalN === 2) return 'BIWEEKLY';
  if (item.interval === PlannedPaymentInterval.WEEKLY) return 'WEEKLY';
  return 'MONTHLY';
}

export function newDraftId(prefix: string): string {
  return `${prefix}-${generator()}`;
}

export function parseAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (!cleaned) return undefined;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

export function uniqueName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing.map(name => name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let next = 2;
  while (taken.has(`${base} ${next}`.toLowerCase())) next += 1;
  return `${base} ${next}`;
}

export function paymentCategoryName(type: CommitmentKind): string {
  return type === 'rent' ? 'Rent' : 'Bills';
}

export function budgetCategoryName(name: string): string {
  return name === 'Food' ? 'Groceries' : name;
}

export function budgetLookupName(item: BudgetItem): string {
  return budgetCategoryName(item.category ?? item.name);
}

export function incomeItemName(item: RecurringIncome): string {
  return item.name.trim() || incomeSourceName(item.source);
}

export function paymentItemName(item: PaymentItem): string {
  return item.name.trim() || paymentName(item.type);
}

export function hasSpendableAccount(accounts: readonly DraftAccount[]): boolean {
  return accounts.some(isSpendableAccount);
}

export function hasPlannedCardPayment(accounts: readonly DraftAccount[]): boolean {
  return accounts.some(account => account.kind === 'card' && (account.cardPaymentAmount ?? 0) > 0);
}

export function incomeSourceName(source: RecurringIncome['source']): string {
  switch (source) {
    case 'salary':
      return 'Salary';
    case 'family':
      return 'Family';
    case 'retirement':
      return 'Retirement';
    case 'freelance':
      return 'Freelance';
    case 'other':
      return 'Other income';
  }
}

export function paymentName(type: CommitmentKind): string {
  switch (type) {
    case 'rent':
      return 'Rent';
    case 'subscription':
      return 'Subscription';
    case 'loan':
      return 'Loan / EMI';
    case 'utilities':
      return 'Utilities';
  }
}
