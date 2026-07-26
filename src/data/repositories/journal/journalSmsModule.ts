/**
 * Narrow SMS-deduplication intent: original-SMS-id, fingerprint, and nearby-journal lookups.
 * Prefer this over `JournalRepository` for SMS ingestion dedup queries.
 */
export { smsJournalQueries } from '@/src/data/repositories/journal/SmsJournalQueries';
