import { evaluateJournalBalance } from '@/src/domain/accounting/journalBalanceEvaluator';
import { toMinorUnits, fromMinorUnits } from '@/src/domain/money/money';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { TransactionType } from '@/src/types/enums';
import type { AccountId, OpenItemId } from '@/src/types/ids';
import { allocatePersonRepaymentMinorUnits } from './personRepaymentAllocation';
import type { JournalWriteLine } from '@/src/types/journalWrite';
import type { OpenItem, SettlementAllocation, AccountUnassignedState } from './personTypes';
import { openItemRemainder } from './personBalanceProjection';

export interface PlannedAllocation {
  openItemId: OpenItemId;
  amount: number;
  kind?: 'repayment' | 'write_off' | 'auto_settle';
}
export interface PlannedSettlement {
  lines: JournalWriteLine[];
  allocations: PlannedAllocation[];
}

function repaymentItemCapacities(
  items: readonly OpenItem[],
  allocations: readonly SettlementAllocation[],
  precision: number,
) {
  return items.map(item => ({
    openItemId: item.id,
    accountId: item.accountId,
    availableMinor: Math.max(
      0,
      toMinorUnits(openItemRemainder(item, allocations, precision), precision),
    ),
    journalDate: item.journalDate ?? item.createdAt ?? 0,
    createdAt: item.createdAt ?? 0,
    id: item.id,
  }));
}

export function planSameCurrencyRepayment(x: {
  cashAccountId: AccountId;
  targetAccountId: AccountId;
  items: readonly OpenItem[];
  activeAllocations: readonly SettlementAllocation[];
  assigned: readonly PlannedAllocation[];
  unassignedAmount: number;
  repaymentLegAmount: number;
  currencyCode: string;
  target: AccountUnassignedState;
  role?: 'receivable' | 'payable';
  precision?: number;
}): PlannedSettlement {
  const precision = x.precision ?? getCurrencyPrecision(x.currencyCode);
  if (x.target.hasNegativeUnassignedRemainder) throw new Error('negative unassigned balance');
  const unassigned = toMinorUnits(x.unassignedAmount, precision);
  if (unassigned < 0) throw new Error('unassigned amount cannot be negative');
  const plan = allocatePersonRepaymentMinorUnits({
    amountMinor: toMinorUnits(x.repaymentLegAmount, precision),
    items: repaymentItemCapacities(
      x.items.filter(item => item.accountId === x.targetAccountId),
      x.activeAllocations,
      precision,
    ),
    requestedAllocations: x.assigned.map(row => ({
      openItemId: row.openItemId,
      amountMinor: toMinorUnits(row.amount, precision),
    })),
  });
  if (plan.unallocatedMinor !== unassigned) throw new Error('allocation total mismatch');
  const payable = x.role === 'payable';
  return {
    allocations: x.assigned.map(a => ({ ...a, kind: 'repayment' })),
    lines: [
      {
        accountId: x.targetAccountId,
        amount: x.repaymentLegAmount,
        transactionType: payable ? TransactionType.DEBIT : TransactionType.CREDIT,
        currencyCode: x.currencyCode,
      },
      {
        accountId: x.cashAccountId,
        amount: x.repaymentLegAmount,
        transactionType: payable ? TransactionType.CREDIT : TransactionType.DEBIT,
        currencyCode: x.currencyCode,
      },
    ],
  };
}

export function planCrossCurrencyRepayment(x: {
  cashAccountId: AccountId;
  openItem: OpenItem;
  cashAmount: number;
  exchangeRate: number;
  journalCurrency: string;
  precisionByCurrency: ReadonlyMap<string, number>;
  targetAmount?: number;
  role: 'receivable' | 'payable';
  activeAllocations?: readonly SettlementAllocation[];
  items?: readonly OpenItem[];
  assigned?: readonly PlannedAllocation[];
}): PlannedSettlement {
  if (
    !x.openItem.accountId ||
    !Number.isFinite(x.exchangeRate) ||
    x.exchangeRate <= 0 ||
    !Number.isFinite(x.cashAmount) ||
    x.cashAmount <= 0
  )
    throw new Error('explicit target and positive FX rate required');
  const precision =
    x.precisionByCurrency.get(x.openItem.currencyCode) ??
    getCurrencyPrecision(x.openItem.currencyCode);
  const targetAmount =
    x.targetAmount ??
    fromMinorUnits(toMinorUnits(x.cashAmount / x.exchangeRate, precision), precision);
  const assignments = x.assigned ?? [{ openItemId: x.openItem.id, amount: targetAmount }];
  if (targetAmount <= 0) throw new Error('allocation total mismatch');
  const allocation = allocatePersonRepaymentMinorUnits({
    amountMinor: toMinorUnits(targetAmount, precision),
    items: repaymentItemCapacities(
      (x.items ?? [x.openItem]).filter(item => item.accountId === x.openItem.accountId),
      x.activeAllocations ?? [],
      precision,
    ),
    requestedAllocations: assignments.map(row => ({
      openItemId: row.openItemId,
      amountMinor: toMinorUnits(row.amount, precision),
    })),
  });
  if (allocation.unallocatedMinor !== 0) throw new Error('allocation total mismatch');
  const payable = x.role === 'payable';
  const cashType = payable ? TransactionType.CREDIT : TransactionType.DEBIT;
  const personType = payable ? TransactionType.DEBIT : TransactionType.CREDIT;
  const cashLine: JournalWriteLine = {
    accountId: x.cashAccountId,
    amount: x.cashAmount,
    transactionType: cashType,
    currencyCode: x.journalCurrency,
  };
  const personLine: JournalWriteLine = {
    accountId: x.openItem.accountId,
    amount: targetAmount,
    transactionType: personType,
    exchangeRate: x.exchangeRate,
    currencyCode: x.openItem.currencyCode,
  };
  const lines = [cashLine, personLine];
  const result = evaluateJournalBalance({
    journalCurrency: x.journalCurrency,
    precisionByCurrency: x.precisionByCurrency,
    lines: lines.map((line, i) => ({
      ...line,
      id: String(i),
      accountCurrency: line.currencyCode!,
    })),
  });
  if (!result.isBalanced)
    throw new Error(`FX journal is not balanced: ${result.issues.map(i => i.code).join(', ')}`);
  return {
    lines,
    allocations: assignments.map(assignment => ({ ...assignment, kind: 'repayment' })),
  };
}

type SettlementAccount = Pick<
  AccountUnassignedState,
  'accountId' | 'currencyCode' | 'ledgerBalanceInNormalDirection'
>;

function settlementAccountBalance(
  account: SettlementAccount,
  items: readonly OpenItem[],
  allocations: readonly SettlementAllocation[],
  precision: number,
) {
  const accountItems = items.filter(item => item.accountId === account.accountId);
  if (accountItems.some(item => item.currencyCode !== account.currencyCode)) {
    throw new Error('open item currency does not match account');
  }
  const openItems = repaymentItemCapacities(accountItems, allocations, precision);
  const ledgerMinor = toMinorUnits(account.ledgerBalanceInNormalDirection, precision);
  const trackedMinor = openItems.reduce((total, item) => total + item.availableMinor, 0);
  const unassignedMinor = ledgerMinor - trackedMinor;
  if (unassignedMinor < 0) throw new Error('negative unassigned balance');

  return { accountId: account.accountId, ledgerMinor, unassignedMinor, openItems };
}

type SettlementAccountBalance = ReturnType<typeof settlementAccountBalance>;

export function planAutoSettle(x: {
  items: readonly OpenItem[];
  accounts: readonly SettlementAccount[];
  roles: ReadonlyMap<string, 'receivable' | 'payable'>;
  activeAllocations: readonly SettlementAllocation[];
  precisionByCurrency?: ReadonlyMap<string, number>;
}): PlannedSettlement {
  const lines: JournalWriteLine[] = [];
  const allocations: PlannedAllocation[] = [];
  for (const currency of new Set(x.accounts.map(a => a.currencyCode))) {
    const precision = x.precisionByCurrency?.get(currency) ?? getCurrencyPrecision(currency);
    const balancesForRole = (role: 'receivable' | 'payable') =>
      x.accounts
        .filter(
          account => account.currencyCode === currency && x.roles.get(account.accountId) === role,
        )
        .map(account => settlementAccountBalance(account, x.items, x.activeAllocations, precision));
    const recv = balancesForRole('receivable');
    const pay = balancesForRole('payable');
    const total = (accounts: SettlementAccountBalance[]) =>
      accounts.reduce((sum, account) => sum + account.ledgerMinor, 0);
    const target = Math.min(total(recv), total(pay));
    if (target <= 0) continue;
    const allocateSide = (accounts: SettlementAccountBalance[], kind: 'receivable' | 'payable') => {
      const accountUnits = new Map<AccountId, number>();
      const openItems = accounts.flatMap(account => account.openItems);
      const itemAccounts = new Map(openItems.map(item => [item.openItemId, item.accountId]));
      const itemPlan = allocatePersonRepaymentMinorUnits({ amountMinor: target, items: openItems });
      for (const allocation of itemPlan.allocations) {
        const accountId = itemAccounts.get(allocation.openItemId);
        if (!accountId) throw new Error('Open item no longer available for auto-settlement');
        allocations.push({
          openItemId: allocation.openItemId,
          amount: fromMinorUnits(allocation.amountMinor, precision),
          kind: 'auto_settle',
        });
        accountUnits.set(accountId, (accountUnits.get(accountId) ?? 0) + allocation.amountMinor);
      }
      let left = itemPlan.unallocatedMinor;
      for (const account of accounts) {
        if (!left) break;
        const units = Math.min(left, account.unassignedMinor);
        if (units > 0) {
          accountUnits.set(account.accountId, (accountUnits.get(account.accountId) ?? 0) + units);
          left -= units;
        }
      }
      if (left) throw new Error(`insufficient ${kind} balance to settle`);
      for (const account of accounts) {
        const units = accountUnits.get(account.accountId) ?? 0;
        if (units)
          lines.push({
            accountId: account.accountId,
            amount: fromMinorUnits(units, precision),
            transactionType: kind === 'receivable' ? TransactionType.CREDIT : TransactionType.DEBIT,
            currencyCode: currency,
          });
      }
    };
    allocateSide(recv, 'receivable');
    allocateSide(pay, 'payable');
  }
  return { lines, allocations };
}

export function planWeAreSettled(x: {
  accounts: readonly SettlementAccount[];
  items: readonly OpenItem[];
  activeAllocations: readonly SettlementAllocation[];
  roles: ReadonlyMap<string, 'receivable' | 'payable'>;
  workplaceCurrency: string;
  expenseAccountId: AccountId;
  incomeAccountId: AccountId;
  precisionByCurrency: ReadonlyMap<string, number>;
  exchangeRateByCurrency: ReadonlyMap<string, number>;
}): PlannedSettlement {
  const precisionByCurrency = new Map(x.precisionByCurrency);
  if (!precisionByCurrency.has(x.workplaceCurrency)) {
    precisionByCurrency.set(x.workplaceCurrency, getCurrencyPrecision(x.workplaceCurrency));
  }
  for (const account of x.accounts) {
    if (!precisionByCurrency.has(account.currencyCode)) {
      precisionByCurrency.set(account.currencyCode, getCurrencyPrecision(account.currencyCode));
    }
  }
  const workplacePrecision = precisionByCurrency.get(x.workplaceCurrency)!;
  let netMinorUnits = 0;
  const lines: JournalWriteLine[] = [];
  const allocations: PlannedAllocation[] = [];

  for (const account of x.accounts) {
    const role = x.roles.get(account.accountId);
    if (role !== 'receivable' && role !== 'payable') continue;
    const precision = precisionByCurrency.get(account.currencyCode)!;
    const { ledgerMinor: closeUnits, openItems } = settlementAccountBalance(
      account,
      x.items,
      x.activeAllocations,
      precision,
    );
    if (closeUnits <= 0) continue;

    const rate =
      account.currencyCode === x.workplaceCurrency
        ? 1
        : x.exchangeRateByCurrency.get(account.currencyCode);
    if (!rate || !Number.isFinite(rate) || rate <= 0)
      throw new Error(`missing FX rate for ${account.currencyCode}`);

    const closeAmount = fromMinorUnits(closeUnits, precision);
    for (const { openItemId, availableMinor } of openItems) {
      if (availableMinor > 0) {
        allocations.push({
          openItemId,
          amount: fromMinorUnits(availableMinor, precision),
          kind: 'write_off',
        });
      }
    }

    const side = role === 'receivable' ? TransactionType.CREDIT : TransactionType.DEBIT;
    const isForeign = account.currencyCode !== x.workplaceCurrency;
    lines.push({
      accountId: account.accountId,
      amount: closeAmount,
      transactionType: side,
      currencyCode: account.currencyCode,
      ...(isForeign ? { exchangeRate: rate } : {}),
    });

    const valued = evaluateJournalBalance({
      journalCurrency: x.workplaceCurrency,
      precisionByCurrency,
      lines: [
        {
          id: 'target',
          accountId: account.accountId,
          accountCurrency: account.currencyCode,
          amount: closeAmount,
          ...(isForeign ? { exchangeRate: rate } : {}),
          transactionType: side,
        },
        {
          id: 'counter',
          accountId: x.expenseAccountId,
          accountCurrency: x.workplaceCurrency,
          amount: fromMinorUnits(
            toMinorUnits(closeAmount * rate, workplacePrecision),
            workplacePrecision,
          ),
          transactionType:
            side === TransactionType.CREDIT ? TransactionType.DEBIT : TransactionType.CREDIT,
        },
      ],
    });
    const valuedLine = valued.lineValues[0];
    if (!valuedLine) throw new Error('FX valuation failed');
    netMinorUnits += (role === 'receivable' ? 1 : -1) * valuedLine.journalAmountMinorUnits;
  }

  if (netMinorUnits > 0) {
    lines.push({
      accountId: x.expenseAccountId,
      amount: fromMinorUnits(netMinorUnits, workplacePrecision),
      transactionType: TransactionType.DEBIT,
      currencyCode: x.workplaceCurrency,
    });
  } else if (netMinorUnits < 0) {
    lines.push({
      accountId: x.incomeAccountId,
      amount: fromMinorUnits(-netMinorUnits, workplacePrecision),
      transactionType: TransactionType.CREDIT,
      currencyCode: x.workplaceCurrency,
    });
  }

  if (lines.length >= 2) {
    const fullCheck = evaluateJournalBalance({
      journalCurrency: x.workplaceCurrency,
      precisionByCurrency,
      lines: lines.map((line, index) => ({
        ...line,
        id: String(index),
        accountCurrency: line.currencyCode ?? x.workplaceCurrency,
      })),
    });
    if (!fullCheck.isBalanced) {
      throw new Error(
        `We're settled journal is not balanced: ${fullCheck.issues.map(i => i.code).join(', ')}`,
      );
    }
  }

  return { lines, allocations };
}
