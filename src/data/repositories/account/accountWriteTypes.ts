import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import type { AuditEntry } from '@/src/data/repositories/AuditRepository';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { Model } from '@nozbe/watermelondb';
import type { AccountPersistenceInput } from './types';

export type AccountAuditContribution = Omit<AuditEntry, 'entityType' | 'entityId'>;

export interface AccountMutationCommitFacts {
  balanceRebuildAccountIds: AccountId[];
}

/** Validated account-local changes plus the effects implied by committing them. */
export interface AccountMutationPlan {
  workplaceId: WorkplaceId;
  account: Account;
  normalizedUpdates: Partial<AccountPersistenceInput>;
  existingMetadata: AccountMetadata | null;
  audit?: AccountAuditContribution;
  commitFacts: AccountMutationCommitFacts;
  currencyChangeAllowed: boolean;
}

export interface AccountMutationResult {
  account: Account;
  commitFacts: AccountMutationCommitFacts;
}

export interface PreparedAccountMutation<T> {
  prepareOps: () => readonly Model[];
  result: T;
  rebuildRequest?: { workplaceId: WorkplaceId; accountIds: readonly AccountId[]; fromDate: number };
}
