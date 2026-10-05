export const ANALYTICS_SANITIZE_CASES = [
  [
    'feature_account_create',
    { feature: 'account', action: 'create', account_type: 'ASSET', currency: 'USD' },
    { feature: 'account', action: 'create', account_type: 'ASSET', currency: 'USD' },
  ],
  [
    'feature_journal_search_query_details',
    { scope: 'journal', count: 1 },
    { feature: 'journal_search', action: 'query_details', scope: 'journal', count: 1 },
  ],
  ['not_registered_event', { count: 1 }, null],
] as const;
