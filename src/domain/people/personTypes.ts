import type { AccountId, JournalId } from '@/src/types/ids';
import type { AccountType, AccountSubtype, TransactionType } from '@/src/types/enums';
import type { JournalWriteLine } from '@/src/types/journalWrite';
export type PersonDomainId = string;
export type OpenItemId = string;
export type SettlementAllocationId = string;
export type PersonAccountRole = 'receivable' | 'payable' | 'expense' | 'income';
export type AccountUnassignedState = {
  accountId: AccountId;
  currencyCode: string;
  ledgerBalanceInNormalDirection: number;
  trackedOpenRemainderSum: number;
  unassignedBalance: number;
  hasNegativeUnassignedRemainder: boolean;
};
export interface Person {
  id: PersonDomainId;
  name: string;
}
export interface PersonLinkedAccount {
  personId: PersonDomainId;
  accountId: AccountId;
  role: PersonAccountRole;
  currencyCode: string;
}
export interface OpenItem {
  id: OpenItemId;
  personId: PersonDomainId;
  accountId: AccountId;
  originatingJournalId: JournalId;
  currencyCode: string;
  originalAmount: number;
  createdAt?: number;
  journalDate?: number;
}
export interface SettlementAllocation {
  id: SettlementAllocationId;
  openItemId: OpenItemId;
  journalId: JournalId;
  amount: number;
  active: boolean;
}
export interface PersonCurrencyBalance {
  currencyCode: string;
  owedToYou: number;
  youOwe: number;
  net: number;
}
export interface PersonBalanceSummary {
  personId: PersonDomainId;
  currencies: PersonCurrencyBalance[];
  convertedNet?: {
    currencyCode: string;
    amount: number;
    isInformational: true;
    missingCurrencies: string[];
  };
}
export interface SplitPlan {
  lines: JournalWriteLine[];
  shares: number[];
}
export interface SettlementPlan {
  lines: JournalWriteLine[];
  allocations: { openItemId: OpenItemId; amount: number }[];
}
export interface JournalIntegrityResult {
  allowed: boolean;
  conflicts: { code: string; openItemIds: OpenItemId[] }[];
  allocationsToDeactivate: SettlementAllocationId[];
}
export interface AccountShape {
  id: AccountId;
  type: AccountType;
  subtype: AccountSubtype;
  currencyCode: string;
  isGroup?: boolean;
}
export interface PostingShape {
  accountType: AccountType;
  transactionType: TransactionType;
}
