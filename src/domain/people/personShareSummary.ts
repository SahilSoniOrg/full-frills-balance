import { safeAdd } from '@/src/domain/money/money';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import type { OpenItem, SettlementAllocation } from './personTypes';
import { openItemRemainder } from './personBalanceProjection';

export function buildPersonShareSummary(input: {
  recipientName: string;
  date: string;
  items: readonly OpenItem[];
  allocations: readonly SettlementAllocation[];
  includeDate?: boolean;
  includeOpenItems?: boolean;
  includeRepayments?: boolean;
  includeBalances?: boolean;
}): string {
  const lines = [`Summary for ${input.recipientName}`];
  if (input.includeDate !== false) lines.push(`Date: ${input.date}`);
  const items = [...input.items].sort(
    (a, b) =>
      (a.journalDate ?? a.createdAt ?? 0) - (b.journalDate ?? b.createdAt ?? 0) ||
      a.currencyCode.localeCompare(b.currencyCode),
  );
  if (input.includeOpenItems !== false) {
    lines.push('Open items:');
    for (const item of items) {
      const remainder = openItemRemainder(item, input.allocations);
      if (remainder > 0) lines.push(`- ${item.currencyCode} ${remainder}`);
    }
  }
  if (input.includeRepayments) {
    lines.push('Repayments:');
    for (const allocation of input.allocations
      .filter(a => a.active)
      .sort((a, b) => a.journalId.localeCompare(b.journalId))) {
      const item = items.find(i => i.id === allocation.openItemId);
      if (item) lines.push(`- ${item.currencyCode} ${allocation.amount}`);
    }
  }
  if (input.includeBalances !== false) {
    const totals = new Map<string, number>();
    for (const item of items) {
      const p = getCurrencyPrecision(item.currencyCode);
      totals.set(
        item.currencyCode,
        safeAdd(totals.get(item.currencyCode) ?? 0, openItemRemainder(item, input.allocations), p),
      );
    }
    lines.push('Remaining balances:');
    for (const [currency, amount] of [...totals].sort(([a], [b]) => a.localeCompare(b)))
      lines.push(`- ${currency} ${amount}`);
  }
  return lines.join('\n');
}
