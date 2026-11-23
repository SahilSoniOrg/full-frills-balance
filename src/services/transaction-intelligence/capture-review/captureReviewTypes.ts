export type {
  CaptureReviewItem,
} from '@/src/data/repositories/journal/JournalCaptureQueries';
export type {
  HistoricalCategoryPattern,
  HistoricalEvidenceEntry,
  HistoricalEvidenceMark,
} from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';

export class CategoryDefaultConflictError extends Error {
  constructor() {
    super('Remove the existing category default before saving this suggestion.');
    this.name = 'CategoryDefaultConflictError';
  }
}
