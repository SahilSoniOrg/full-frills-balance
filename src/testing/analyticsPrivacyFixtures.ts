export const ANALYTICS_SANITIZE_CASES = [
  ['account_created', { type: 'ASSET', currency: 'USD' }, { type: 'ASSET', currency: 'USD' }],
  [
    'planned_payment_created',
    { interval: 'MONTHLY', type: 'auto' },
    { interval: 'MONTHLY', type: 'auto' },
  ],
  [
    'feature_journal_search_query_details',
    { scope: 'journal', count: 1 },
    { feature: 'journal_search', action: 'query_details', scope: 'journal', count: 1 },
  ],
  ['not_registered_event', { count: 1 }, null],
] as const;
