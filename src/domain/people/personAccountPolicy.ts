import { AccountSubtype, AccountType, TransactionType } from '@/src/types/enums';
import type { AccountShape, PersonAccountRole } from './personTypes';
export type MoneyFlow = 'outflow' | 'inflow';
export function expectedPersonAccount(
  flow: MoneyFlow,
  repayable: boolean,
): { role: PersonAccountRole; type: AccountType; subtype: AccountSubtype } {
  if (flow === 'outflow' && repayable)
    return { role: 'receivable', type: AccountType.ASSET, subtype: AccountSubtype.RECEIVABLE };
  if (flow === 'outflow')
    return { role: 'expense', type: AccountType.EXPENSE, subtype: AccountSubtype.OTHER };
  if (repayable)
    return { role: 'payable', type: AccountType.LIABILITY, subtype: AccountSubtype.PAYABLE };
  return { role: 'income', type: AccountType.INCOME, subtype: AccountSubtype.OTHER };
}
export function isCompatiblePersonAccount(a: AccountShape, configurableLiability = true): boolean {
  if (a.isGroup) return false;
  if ([AccountType.ASSET, AccountType.EXPENSE, AccountType.INCOME].includes(a.type)) return true;
  return (
    a.type === AccountType.LIABILITY &&
    a.subtype !== AccountSubtype.CREDIT_CARD &&
    a.subtype !== AccountSubtype.TAX_PAYABLE &&
    (configurableLiability ||
      a.subtype === AccountSubtype.PAYABLE ||
      a.subtype === AccountSubtype.LOAN)
  );
}
export function classifyPersonDebtPosting({
  accountType,
  transactionType,
}: {
  accountType: AccountType;
  transactionType: TransactionType;
}): 'increasing' | 'reducing' | null {
  if (accountType === AccountType.ASSET)
    return transactionType === TransactionType.DEBIT ? 'increasing' : 'reducing';
  if (accountType === AccountType.LIABILITY)
    return transactionType === TransactionType.CREDIT ? 'increasing' : 'reducing';
  return null;
}
