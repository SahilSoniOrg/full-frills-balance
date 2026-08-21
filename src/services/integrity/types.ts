import { AccountId } from '@/src/types/domain';

export interface BalanceVerificationResult {
  accountId: AccountId;
  accountName: string;
  cachedBalance: number;
  computedBalance: number;
  matches: boolean;
  discrepancy: number;
  /** True when a snapshot's stored absoluteBalance didn't match a recomputation at that point */
  snapshotCorrupted?: boolean;
}

export interface IntegrityCheckResult {
  totalAccounts: number;
  accountsChecked: number;
  discrepanciesFound: number;
  repairsAttempted: number;
  repairsSuccessful: number;
  results: BalanceVerificationResult[];
}

export type IntegrityProgressCallback = (message: string, progress: number) => void;
export type IntegrityRepairTrigger = 'startup' | 'manual' | 'repair';
