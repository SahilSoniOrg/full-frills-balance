import { SmsMessage } from '@/modules/expo-sms-inbox';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import type { CreateJournalData } from '@/src/types/journalWrite';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { DuplicateMatch } from '@/src/services/sms/smsDuplicateDetection';
import { InboxProcessingStatus } from '@/src/types/enums';
import type { AccountId, JournalId } from '@/src/types/ids';

export interface SmsContentReservation {
  journalId: JournalId;
  messageDate: number;
}

export interface SmsAnalysisResult {
  message: SmsMessage;
  parsed: ParsedTransaction;
  fingerprint: string;
  existingRecord: InboxRecordSnapshot | null;
  duplicate: DuplicateMatch;
  exactJournalId?: JournalId;
  finalStatus: InboxProcessingStatus;
  autoPost?: {
    ruleId: string;
    journalData: CreateJournalData;
  };
  reviewRule?: {
    sourceAccountId?: AccountId;
    categoryAccountId?: AccountId;
  };
}

export interface AutoPostRuleAnalysis {
  disposition: 'auto_post' | 'review' | 'ignore';
  ruleId: string;
  createData?: {
    journalData: CreateJournalData;
  };
  sourceAccountId?: AccountId;
  categoryAccountId?: AccountId;
}
