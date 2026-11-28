import type {
  AccountId,
  JournalId,
  OpenItemId,
  PersonId,
  SettlementAllocationId,
} from '@/src/types/ids';
import type { AccountType, AccountSubtype, TransactionType } from '@/src/types/enums';
import type { JournalWriteLine } from '@/src/types/journalWrite';
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
  id: PersonId;
  name: string;
}
export interface PersonLinkedAccount {
  personId: PersonId;
  accountId: AccountId;
  role: PersonAccountRole;
  currencyCode: string;
}
export interface OpenItem {
  id: OpenItemId;
  personId: PersonId;
  accountId: AccountId;
  originatingJournalId: JournalId;
  currencyCode: string;
  originalAmount: number;
  direction?: 'receivable' | 'payable';
  createdAt?: number;
  journalDate?: number;
}
export interface SettlementAllocation {
  id: SettlementAllocationId;
  openItemId: OpenItemId;
  accountId?: AccountId;
  journalId: JournalId;
  amount: number;
  active: boolean;
  journalDate?: number;
  kind?: 'repayment' | 'write_off' | 'auto_settle';
}
export interface PersonCurrencyBalance {
  currencyCode: string;
  owedToYou: number;
  youOwe: number;
  net: number;
}
export interface PersonBalanceSummary {
  personId: PersonId;
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
