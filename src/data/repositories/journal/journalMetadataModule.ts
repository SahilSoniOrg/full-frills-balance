/**
 * Narrow journal-metadata intent: metadata lookup and patch operations only.
 * Prefer this over `JournalRepository` for journal metadata reads and partial patches.
 */
export { journalMetadataRepository } from '@/src/data/repositories/journal/journalMetadataRepository';
