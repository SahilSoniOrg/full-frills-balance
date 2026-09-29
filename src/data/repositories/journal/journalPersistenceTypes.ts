import type Journal from '@/src/data/models/Journal';
import type {
  JournalWriteFields,
  JournalWriteLine,
  JournalWriteMetadata,
} from '@/src/types/journalWrite';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { AccountId, JournalId, PlannedPaymentId } from '@/src/types/ids';

export type JournalPersistenceLine = JournalWriteLine;
export type JournalPersistenceMetadata = JournalWriteMetadata;

/** Plain input to the journal persistence boundary. Contains no WatermelonDB models. */
export interface PutJournalInput extends JournalWriteFields {
  journalId?: JournalId;
  /** Derived from the lines and their account types when omitted. */
  displayType?: JournalDisplayType;
}

/** Existing-journal update shape for generic sparse puts, such as a description edit. */
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
  transactions?: JournalPersistenceLine[];
  metadata?: JournalPersistenceMetadata;
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
