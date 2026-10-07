export const JOURNAL_DETAILS_LIMITS = {
  budgetPreview: 3,
  historyEvents: 4,
  historyDetailLines: 2,
  journalNumberLength: 8,
  journalNumberGroupLength: 4,
  exchangeRateFractionDigits: 8,
} as const;

export const JOURNAL_DETAILS_LAYOUT = {
  /** Wrap point for the summary title before the status badge drops below it. */
  summaryTitleBasis: 180,
  /** Wrap point for an entry's account column before its amount drops below it. */
  entryIdentityBasis: 160,
} as const;

export const JOURNAL_DETAILS_DATE_PATTERN = 'ddd, MMM D';
