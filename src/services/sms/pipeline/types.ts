import { SmsMessage } from '@/modules/expo-sms-inbox';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import type { CreateJournalData } from '@/src/types/journalWrite';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { DuplicateMatch } from '@/src/services/sms/smsDuplicateDetection';
import { InboxProcessingStatus } from '@/src/types/enums';
import { JournalId } from '@/src/types/ids';

export interface SmsAnalysisResult {
  message: SmsMessage;
  parsed: ParsedTransaction;
  fingerprint: string;
  existingRecord: TransactionInboxRecord | null;
  duplicate: DuplicateMatch;
  exactJournalId?: JournalId;
  finalStatus: InboxProcessingStatus;
  autoPost?: {
    ruleId: string;
    journalData: CreateJournalData;
  };
}

export interface AutoPostRuleAnalysis {
  disposition: 'auto_post' | 'review' | 'ignore';
  ruleId: string;
  createData?: {
    journalData: CreateJournalData;
  };
}
