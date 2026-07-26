/**
 * Narrow write intent: journal/transaction persistence and reversal only.
 * Prefer this over `JournalRepository` for create, update, delete, and reversal.
 */
export {
  journalWriteRepository,
  type CreateJournalData,
  type PrepareCreateJournalData,
} from '@/src/data/repositories/journal/journalWriteRepository';
