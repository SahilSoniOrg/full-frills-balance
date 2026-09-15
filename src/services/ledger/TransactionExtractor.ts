import type { TransactionChannel } from '@/src/types/domainJournal';

export type { TransactionChannel };

export interface RawTransactionInput {
  channel: TransactionChannel;
  id: string; // Unique source ID (e.g., SMS message UID, voice timestamp ID, Email message-id)
  rawText: string; // Unmodified input text
  date: number; // Unix timestamp when input was received/spoken
  senderAddress?: string; // Phone number (SMS), Email address (Email), or undefined (Voice)
  metadata?: Record<string, unknown>; // Custom metadata specific to the channel
}

export interface ExtractedInfo {
  amount?: number;
  currencyCode?: string;
  direction: 'debit' | 'credit' | 'unknown';
  referenceNumber?: string;
  sourceAccountHint?: string; // e.g., "HDFC 1234", "cash"
  destinationCategoryHint?: string; // e.g., "banana", "uber", "groceries"
  merchantName?: string; // e.g., "Starbucks", "Uber India"
  date?: number;
  isReversal?: boolean;
  channel?: TransactionChannel;
}

export interface TransactionExtractor {
  canExtract(input: RawTransactionInput): boolean;
  extract(input: RawTransactionInput): Promise<ExtractedInfo>;
}
