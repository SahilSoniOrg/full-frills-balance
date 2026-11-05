import { SmsMessage } from '@/modules/expo-sms-inbox';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { DuplicateMatch } from '@/src/services/sms/smsDuplicateDetection';
import type { JournalId } from '@/src/types/ids';

export interface SmsContentReservation {
  journalId: JournalId;
  messageDate: number;
}

export interface SmsAnalysisResult {
  message: SmsMessage;
  parsed: ParsedTransaction;
  fingerprint: string;
  duplicate: DuplicateMatch;
}
