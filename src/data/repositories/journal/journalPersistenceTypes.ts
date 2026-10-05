import type Journal from '@/src/data/models/Journal';
import type Account from '@/src/data/models/Account';
import type {
  JournalWriteFields,
  JournalWriteLine,
  JournalWriteMetadata,
} from '@/src/types/journalWrite';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { AccountId, JournalId, PlannedPaymentId } from '@/src/types/ids';

export interface PutJournalInput extends JournalWriteFields {
  journalId?: JournalId;
  displayType?: JournalDisplayType;
}

export interface PutJournalPatchInput {
  journalId: JournalId;
  journalDate?: number;
  description?: string;
  notes?: string;
  currencyCode?: string;
  status?: JournalStatus;
  originalJournalId?: JournalId;
  plannedPaymentId?: PlannedPaymentId;
  displayType?: JournalDisplayType;
  transactions?: JournalWriteLine[];
  metadata?: JournalWriteMetadata;
}

export type PutJournalRequest = PutJournalInput | PutJournalPatchInput;

export interface MergeJournalsInput {
  sourceJournalIds: readonly JournalId[];
  description?: string;
  journalDate?: number;
  displayType?: JournalDisplayType;
}

export interface ReassignJournalAccountsInput {
  accountIdByTransactionId: ReadonlyMap<string, AccountId>;
}

export interface ReverseJournalOptions {
  reversedAt?: number;
}

/** Derived-balance work a committed write requires. */
export interface JournalRebuildImpact {
  affectedAccountIds: ReadonlySet<AccountId>;
  rebuildFromDate: number;
}

export interface JournalPersistenceResult extends JournalRebuildImpact {
  journal: Journal;
  previousStatus?: JournalStatus;
  status: JournalStatus;
}

export interface ValidatedJournal {
  lines: readonly JournalWriteLine[];
  totalAmount: number;
  accountsById: ReadonlyMap<AccountId, Account>;
  precisionByAccountId: ReadonlyMap<AccountId, number>;
  displayType: JournalDisplayType;
}
