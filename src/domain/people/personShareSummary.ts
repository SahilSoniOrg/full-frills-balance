import { safeAdd } from '@/src/domain/money/money';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import type { OpenItem, PersonCurrencyBalance, SettlementAllocation } from './personTypes';
import { openItemRemainder } from './personBalanceProjection';

export function buildPersonShareSummary(input: {
  recipientName: string;
  date: string;
  paymentHandle?: string;
  items: readonly OpenItem[];
  allocations: readonly SettlementAllocation[];
  balances?: readonly PersonCurrencyBalance[];
  includeDate?: boolean;
  includeOpenItems?: boolean;
  includeRepayments?: boolean;
  includeBalances?: boolean;
  includePaymentHandle?: boolean;
}): string {
  const lines = [`Summary for ${input.recipientName}`];
  if (input.includeDate !== false) lines.push(`Date: ${input.date}`);
  if (input.includePaymentHandle && input.paymentHandle?.trim()) {
    lines.push(`Payment handle: ${input.paymentHandle.trim()}`);
  }
  const items = [...input.items].sort(
    (a, b) =>
      (a.journalDate ?? a.createdAt ?? 0) - (b.journalDate ?? b.createdAt ?? 0) ||
      a.currencyCode.localeCompare(b.currencyCode),
  );
  if (input.includeOpenItems !== false) {
    lines.push('Open items:');
    for (const item of items) {
      const remainder = openItemRemainder(item, input.allocations);
      if (remainder > 0)
        lines.push(
          `- ${item.direction === 'payable' ? 'I owe you' : 'You owe me'} ${item.currencyCode} ${remainder} remaining of ${item.originalAmount}${item.journalDate ? ` (${new Date(item.journalDate).toLocaleDateString()})` : ''}`,
        );
    }
  }
  if (input.includeRepayments) {
    lines.push('Repayments:');
    for (const allocation of input.allocations
      .filter(a => a.active && (!a.kind || a.kind === 'repayment'))
      .sort((a, b) => a.journalId.localeCompare(b.journalId))) {
      const item = items.find(i => i.id === allocation.openItemId);
      if (item)
        lines.push(
          `- ${item.direction === 'payable' ? 'I paid you' : 'You paid me'} ${item.currencyCode} ${allocation.amount}${allocation.journalDate ? ` (${new Date(allocation.journalDate).toLocaleDateString()})` : ''}`,
        );
    }
  }
  if (input.includeBalances !== false) {
    const totals = new Map<string, { owedToYou: number; youOwe: number }>();
    for (const item of items) {
      const p = getCurrencyPrecision(item.currencyCode);
      const balance = totals.get(item.currencyCode) ?? { owedToYou: 0, youOwe: 0 };
      const key = item.direction === 'payable' ? 'youOwe' : 'owedToYou';
      balance[key] = safeAdd(balance[key], openItemRemainder(item, input.allocations), p);
      totals.set(item.currencyCode, balance);
    }
    lines.push('Remaining balances:');
    const balances =
      input.balances ??
      [...totals].map(([currencyCode, balance]) => ({
        currencyCode,
        ...balance,
        net: balance.owedToYou - balance.youOwe,
      }));
    for (const balance of balances) {
      lines.push(
        `- ${balance.currencyCode}: you owe me ${balance.owedToYou}, I owe you ${balance.youOwe}, net owed to me ${balance.net}`,
      );
    }
  }
  return lines.join('\n');
}
