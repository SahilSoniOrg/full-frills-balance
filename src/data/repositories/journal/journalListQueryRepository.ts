/** Compatibility exports; ordinary journal reads share one query repository. */
export {
  JournalQueryRepository as JournalListQueryRepository,
  journalQueryRepository as journalListQueryRepository,
} from './journalQueryRepository';
