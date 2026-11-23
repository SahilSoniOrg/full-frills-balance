/** Thin façade: public import path stays `@/src/services/transaction-intelligence/captureReviewService`. */

export type {
  CaptureReviewItem,
  HistoricalCategoryPattern,
  HistoricalEvidenceEntry,
  HistoricalEvidenceMark,
} from './capture-review/captureReviewTypes';
export { CategoryDefaultConflictError } from './capture-review/captureReviewTypes';

export {
  countCaptureReviewItems,
  subscribeToCaptureChanges,
  listCaptureItems,
  confirmCaptureCategories,
} from './capture-review/captureReviewItems';

export {
  listHistoricalPatternEvidenceEntries,
  listHistoricalPatternEvidenceWindow,
  saveHistoricalCaptureCategoryDefault,
} from './capture-review/captureReviewHistorical';

export {
  listCaptureDescriptionDefaults,
  listOpenCaptureMerchants,
  listCaptureCategoryDefaults,
  saveCaptureCategoryDefault,
  removeCaptureCategoryDefault,
  resolveCaptureCategoryDefaultConflict,
  setCaptureDescriptionDefault,
  setCaptureMerchantsOpen,
  setCaptureMerchantOpen,
} from './capture-review/captureReviewDefaults';
