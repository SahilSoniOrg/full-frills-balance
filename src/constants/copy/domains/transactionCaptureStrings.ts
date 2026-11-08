export const transactionCaptureStrings = {
  title: 'Capture & review',
  description: 'Manage transaction sources, category review, and future matching defaults.',
  workspaceDescription:
    'SMS messages that cannot be safely captured stay in the inbox. Captured entries are already in your books; entries needing a category appear below. Saved defaults affect future matches only.',
  captureHeader: 'Automatic capture',
  captureTitle: 'Capture new transactions',
  captureDescription:
    'Post supported transactions to this workplace when their accounts and movement are clear. Uncertain categories go to Uncategorized for you to review.',
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
  reviewHeader: 'Review work',
  reviewOpenTitle: 'Review categories',
  reviewLoading: 'Checking for transactions to categorize…',
  reviewCount: (count: number) =>
    count === 1 ? '1 transaction needs a category' : `${count} transactions need a category`,
  reviewHint:
    'Choose a category on the existing entry. Editing its description alone does not confirm its category.',
  emptyReview: 'No captured entries need categorization.',
  suggestionsTitle: 'Future suggestions',
  suggestionsOverviewDescription:
    'Review category and name suggestions separately from your capture settings.',
  suggestionsPageDescription:
    'Review patterns from past entries before saving them. Saved defaults apply to future matches only; existing entries do not change.',
  suggestionsReviewTab: (count?: number) => (count == null ? 'To review' : `To review · ${count}`),
  suggestionsSavedTab: (count?: number) => (count == null ? 'Saved' : `Saved · ${count}`),
  suggestionsHiddenInPrivateMode: 'Suggestions are hidden while Privacy Mode is on.',
  suggestionsEmptyTitle: 'No suggestions to review',
  suggestionsEmptyDescription:
    'When useful patterns appear in confirmed entries or linked SMS history, they will show up here.',
  savedSuggestionsEmptyTitle: 'No saved defaults yet',
  savedSuggestionsEmptyDescription:
    'When you save a category or name suggestion, you can pause or remove it here.',
  privateDescription: 'Captured transaction',
  reviewAction: 'Choose a category',
  suggestedCategory: (name: string) => `Suggested: ${name}`,
  confirmCurrentCategories: (names: string) => `Confirm ${names}`,
  defaultedHeader: 'Automatically categorized',
  defaultedHint:
    'These entries used a saved category. Confirm an entry if you want it to inform future suggestions.',
  defaultedReview: 'Open entry to review the category',
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
  historicalCategoryHint:
    'These are categories used on posted journals linked to SMS. Tap a name to inspect an example entry; save only if the history fits future transactions.',
  historicalVariantCandidatesHeader: (count: number) => `Possible SMS name matches · ${count}`,
  historicalVariantCandidatesHint:
    'Names that normalize to the same spelling link to their own past entries. Opening a link never changes them; saved defaults use the existing case-insensitive matcher.',
  historicalVariantPair: (names: string[]) => `Possible match: ${names.join(' · ')}`,
  historicalNameLinkDetails: (journalCount: number, sourceCount: number) =>
    `${journalCount === 1 ? '1 past entry' : `${journalCount} past entries`} · ${sourceCount === 1 ? '1 SMS message' : `${sourceCount} SMS messages`} · Open a linked entry`,
  reviewLink: 'Review',
  historicalCategoryDetails: (
    journalCount: number,
    sourceCount: number,
    account: string,
    currency: string,
    kind: string,
  ) =>
    `${journalCount === 1 ? '1 past entry' : `${journalCount} past entries`} · ${sourceCount === 1 ? '1 SMS message' : `${sourceCount} SMS messages`} · ${account} · ${currency} ${kind}`,
  historicalCategoryAction: (category: string) => `Use ${category} for future matches`,
  historicalMixedHeader: 'Category history disagrees',
  historicalMixedHint: (count: number) =>
    `${count} merchant groups have more than one past category. They stay visible for review and will not suggest a default.`,
  historicalMixedBadge: 'Mixed',
  historicalCategoryBreakdown: 'Past categories',
  rememberHistoricalCategoryTitle: 'Save this historical suggestion?',
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
    return `${entries} and ${messages} show ${merchant} on ${account} using ${category}. Save this category for future ${currency} ${kind} matches? Existing entries will not change. Merchant matching ignores case and does not create aliases for other spellings.`;
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
  reviewActivityHeader: 'Review and history',
  sourcesHeader: 'Message sources',
  inboxTitle: 'Transaction inbox',
  inboxDescription: 'Unimported messages, duplicates, and import errors.',
  activityTitle: 'Journal activity',
  activityDescription: 'Browse transactions already in your books.',
  smsTitle: 'SMS source settings',
  smsDescription: 'Manage SMS access and review alerts on this device.',
  sourcesUnavailable: 'Automatic SMS capture is available on Android.',
  loading: 'Loading capture settings and review…',
  loadError: 'Capture settings or review could not be loaded.',
  updateErrorTitle: 'Capture settings not updated',
  retry: 'Try again',
} as const;
