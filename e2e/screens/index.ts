export const onboarding = {
  screen: 'onboarding-screen',
  cashClarityScreen: 'onboarding-v2-screen',
  cashClarityInput: 'onboarding-v2-you-input',
  cashClarityStart: 'onboarding-v2-start',
  cashClaritySkip: 'onboarding-v2-skip',
  cashClarityContinue: 'onboarding-v2-continue',
  nameInput: 'onboarding-name-input',
  gridContinue: 'selectable-grid-continue-button',
  themeContinue: 'onboarding-theme-continue-button',
  finishButton: 'onboarding-finish-button',
  workplaceIdentityContinue: 'workplace-basic-info-continue-button',
  workplaceNameInput: 'workplace-name-input',
  summary: 'onboarding-summary-step',
  restoreButton: 'onboarding-restore-button',
  restoreSource: 'restore-source-slice',
  restoreSummary: 'restore-summary-slice',
  restoreSummaryContinue: 'restore-summary-continue',
} as const;

export const dashboard = {
  screen: 'dashboard-screen',
  tab: 'tab-dashboard',
} as const;

export const tabs = {
  accounts: 'tab-accounts',
  commitments: 'tab-commitments',
  activity: 'tab-activity',
  settings: 'tab-settings',
} as const;

export const journal = {
  screen: 'journal-entry-screen',
  amountInput: 'amount-input',
  descriptionInput: 'journal-description-input',
  submitFooter: 'submit-footer-button',
  browseDestination: 'journal-browse-destination',
  browseSource: 'journal-browse-source',
  accountPickerSearch: 'account-picker-search-input',
  browseForRole: (role: 'destination' | 'source') => `journal-browse-${role}`,
} as const;

export const accounts = {
  fab: 'fab-button',
  tabAccounts: 'tab-item-accounts',
  submitFooter: 'submit-footer-button',
} as const;

export const commitments = {
  tabs: 'commitments-tabs',
} as const;

export const budgets = {
  intervalItem: (interval: string) => `budget-interval-type-item-${interval}`,
} as const;

export const plannedPayments = {
  heroName: 'hero-name-input',
  heroAmount: 'hero-amount-input',
  fromAccount: 'planned-payment-from-account',
  toAccount: 'planned-payment-to-account',
  submitFooter: 'submit-footer-button',
} as const;

export const smsInbox = {
  screen: 'transaction-inbox-screen',
  settingsAutomation: 'settings-automation',
  settingsSmsInbox: 'settings-sms-inbox',
  filterDuplicates: 'inbox-filter-duplicates',
  filterPending: 'inbox-filter-pending',
  refreshSms: 'inbox-refresh-sms',
  item: (deviceSourceId: string) => `inbox-item-${deviceSourceId}`,
  compareDuplicate: (deviceSourceId: string) => `inbox-compare-duplicate-${deviceSourceId}`,
} as const;
