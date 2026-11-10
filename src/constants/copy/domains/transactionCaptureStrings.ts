export const transactionCaptureStrings = {
  title: 'Capture & review',
  description:
    'Set up automatic capture, review incoming messages and transactions that need a category, and choose defaults for future matches.',
  captureHeader: 'Automatic capture',
  captureTitle: 'Capture new transactions',
  captureDescription:
    'Add supported new transactions to this workplace automatically when the account and transaction details are clear. Transactions with uncertain categories go to Uncategorized for review.',
  enableTitle: 'Enable automatic capture?',
  enableMessage:
    'Supported new messages from sources you connect will create journal entries in this workplace. Unknown categories need review. Existing messages stay in the inbox for manual import.',
  enableAction: 'Enable capture',
  cancel: 'Cancel',
  enabledSince: (date: string) => `Capturing supported messages received from ${date}.`,
  disabledHint: 'Automatic capture is off. You can still review and import messages manually.',
  accountSetupHint:
    'Some accounts need an Uncategorized category before their transactions can be captured.',
  accountSetupAction: 'Set up account categories',
  attentionHeader: 'Needs attention',
  reviewPageTitle: 'Transactions to categorize',
  reviewOpenTitle: 'Transactions to categorize',
  reviewLoading: 'Checking for transactions to categorize…',
  reviewCount: (count: number) =>
    count === 1
      ? '1 captured transaction needs a category'
      : `${count} captured transactions need a category`,
  reviewHint:
    'Open a transaction to choose its category, or confirm the categories already assigned below.',
  emptyReview: 'No transactions need a category.',
  matchingHeader: 'Future matching',
  suggestionsTitle: 'Matching suggestions',
  suggestionsOverviewDescription:
    'Review category and name suggestions, then save the defaults you want used for future matches.',
  suggestionsReviewTab: (count?: number) => (count == null ? 'To review' : `To review · ${count}`),
  suggestionsSavedTab: (count?: number) =>
    count == null ? 'Saved defaults' : `Saved defaults · ${count}`,
  suggestionsReviewCardDescription:
    'Check captured examples, then confirm or save a rule for future matches.',
  suggestionsSavedCardDescription:
    'Manage rules for future matches. Pause a merchant or remove a rule.',
  suggestionsHiddenInPrivateMode: 'Suggestions are hidden while Privacy Mode is on.',
  suggestionsEmptyTitle: 'No suggestions to review',
  suggestionsEmptyDescription:
    'When useful patterns appear in confirmed entries or linked SMS history, they will show up here.',
  savedSuggestionsEmptyTitle: 'No saved defaults yet',
  savedSuggestionsEmptyDescription:
    'Save a category or name suggestion to create a future default. Saved defaults will appear here so you can pause or remove them.',
  privateDescription: 'Captured transaction',
  reviewAction: 'Choose a category',
  suggestedCategory: (name: string) => `Suggested: ${name}`,
  confirmCurrentCategories: (names: string) => `Confirm ${names}`,
  defaultedHeader: 'Confirm automatic categories',
  defaultedHint:
    'These entries used a saved category. Confirm the ones that look right to inform future suggestions.',
  defaultedReview: 'Category needs review',
  reviewTransaction: 'Review transaction',
  viewExample: 'View example',
  rememberCategory: 'Use this category for future matches',
  rememberCategoryTitle: 'Use this category automatically?',
  rememberCategoryMessage: (
    category: string,
    merchant: string,
    account: string,
    currency: string,
    kind: string,
  ) =>
    `Future ${currency} ${kind} entries for ${merchant} on ${account} will use ${category}. This does not change existing entries. You can remove the default or keep the merchant open.`,
  rememberCategoryAction: 'Use this category',
  categoryChanged: 'The suggested category or account changed. Review the entry again.',
  categoryDefaultsHeader: 'Category defaults',
  categoryDefaultsHint:
    'Each saved merchant name has its own future-match default. Pausing a name sends its future entries to review.',
  categoryDefaultConflictTitle: 'Choose one category to keep',
  categoryDefaultConflictHint:
    'An account merge brought these saved choices together. No category is applied until you choose one.',
  chooseCategoryDefault: (category: string) => `Keep ${category}`,
  categoryCandidatesHeader: 'Category suggestions',
  categoryCandidatesHint:
    'Save a confirmed category for future matches with the same merchant, account, currency, and transaction type. Existing entries stay unchanged.',
  historicalCategoryHeader: 'Suggestions from SMS history',
  historicalPagesHeader: 'SMS history',
  historicalCategoryPageDescription: 'Review repeated categories from past SMS-linked entries.',
  historicalMixedPageDescription:
    'Review entries where the same merchant used different categories.',
  historicalPageEmpty: 'No repeated SMS history patterns are available.',
  historicalCategoryHint:
    'These categories come from past transactions linked to SMS. Review the matching entries before saving a future default.',
  historicalSearchPlaceholder: 'Search merchants, categories, or accounts',
  historicalSearchNoResults: 'No SMS history matches that search.',
  historicalSortBy: 'Sort by',
  historicalSortLatest: 'Latest',
  historicalSortAlphabetical: 'A–Z',
  historicalSortRepeats: 'Most repeats',
  historicalOpenEntries: 'Open matching entries',
  historicalLatestEntry: (date: string) => `Latest entry ${date}`,
  historicalCategoryDetails: (
    journalCount: number,
    sourceCount: number,
    account: string,
    currency: string,
    kind: string,
  ) =>
    `${journalCount === 1 ? '1 past entry' : `${journalCount} past entries`} · ${sourceCount === 1 ? '1 SMS' : `${sourceCount} SMS`} · ${account} · ${currency} ${kind}`,
  historicalCategoryAction: (category: string) => `Use ${category} for future matches`,
  historicalCategoryCompactAction: 'Save default',
  historicalKeepReviewAction: 'Always review',
  historicalMixedHeader: 'Different past categories',
  historicalMixedHint: (count: number) =>
    `${count} merchant groups have different categories in past transactions. No default is suggested; keep these merchants in review and choose a category each time.`,
  historicalMixedBadge: 'Mixed',
  historicalCategoryBreakdown: 'Past categories',
  rememberHistoricalCategoryTitle: 'Save this category default?',
  rememberHistoricalCategoryAction: 'Save default',
  rememberHistoricalCategoryMessage: (
    category: string,
    merchant: string,
    account: string,
    currency: string,
    kind: string,
    count: number,
    sourceCount: number,
  ) => {
    const entries = count === 1 ? `1 past ${kind} entry` : `${count} past ${kind} entries`;
    const messages =
      sourceCount === 1 ? '1 linked SMS message' : `${sourceCount} linked SMS messages`;
    return `${entries} and ${messages} show ${merchant} on ${account} in ${category}. This default applies to future entries matching the merchant, account, type (${kind}), and currency (${currency}), whether captured from SMS or Gmail. SMS matchers help recognize the account; this default does not select or change a matcher. Past entries are unchanged. Merchant matching ignores case; other spellings are separate.`;
  },
  descriptionCandidatesHeader: 'Name suggestions',
  descriptionCandidatesHint:
    'Save this description for future matches with the same merchant, amount, currency, and transaction type. Existing entries stay unchanged.',
  categoryDefaultDetails: (
    account: string,
    currency: string,
    kind: string,
    paused: boolean,
    available: boolean,
  ) =>
    `${account} · ${currency} · ${kind}${paused ? ' · Paused' : ''}${available ? '' : ' · Unavailable'}`,
  forgetCategory: 'Remove category default',
  descriptionDefaultsHeader: 'Name defaults',
  unknownMerchant: 'Unknown merchant',
  descriptionDefaultDetails: (merchant: string, paused: boolean) =>
    `${merchant}${paused ? ' · Paused' : ''}`,
  recurringHint: 'This amount has occurred here before. Add a name, or keep this merchant open.',
  keepMerchantOpen: 'Always review this merchant’s transactions',
  allowMerchantSuggestions: 'Resume automatic matching for this merchant',
  rememberName: 'Use this name for future matches',
  forgetName: 'Stop using this name automatically',
  rememberNameTitle: 'Use this name again?',
  rememberNameMessage:
    'Future entries with this merchant, amount, currency, and transaction type will use this name. You can keep the merchant open to pause automatic naming.',
  rememberNameAction: 'Use this name',
  showMore: 'Show more entries',
  sourcesHeader: 'Message sources',
  inboxTitle: 'Transaction inbox',
  inboxDescription: 'Messages waiting to be imported, duplicates, and messages with import errors.',
  smsTitle: 'SMS settings',
  smsDescription: 'Manage SMS access, automatic import, and review alerts on this device.',
  captureUnavailable: 'Automatic capture is available in the mobile app.',
  loading: 'Loading capture settings and review…',
  loadError: 'Capture settings or review could not be loaded.',
  refreshError: 'Could not refresh suggestions. Showing the last loaded data.',
  updateErrorTitle: 'Capture settings not updated',
  checkingSources: 'Checking message sources…',
  captureSourceRequiredAndroid:
    'Enable automatic SMS import or Gmail capture under Message sources to use automatic capture for this workplace.',
  captureSourceRequired:
    'Connect Gmail and enable Gmail capture under Message sources to use automatic capture for this workplace.',
  noAutomaticSourceEnabled:
    'No message source is enabled for automatic capture. Enable a source above, or turn off this workplace setting.',
  retry: 'Try again',
  inboxChannelSpoken: 'Spoken',
  inboxChannelEmail: 'Email',
  inboxChannelSms: 'SMS',
  inboxSpokenDraft: 'Spoken Draft',
  inboxUnknownOrigin: 'Unknown Origin',
  inboxActionOpenJournal: 'Open Journal',
  inboxActionUndoDismiss: 'Undo Dismiss',
  inboxActionCompareDuplicate: 'Compare duplicate',
  inboxActionImportReview: 'Import / Review',
  inboxActionEditReparse: 'Edit & Re-parse',
  inboxActionSplit: 'Split',
  inboxActionDismiss: 'Dismiss',
  inboxActionViewRaw: 'View Raw',
  inboxActionMore: 'More',
  inboxRawVoiceTitle: 'Raw Voice Transcript',
  inboxRawMessageTitle: 'Raw Message',
  inboxActionErrorTitle: 'Transaction Inbox',
} as const;
