export const onboarding = {
  screen: 'onboarding-screen',
  nameInput: 'onboarding-name-input',
  start: 'onboarding-start',
  skip: 'onboarding-skip',
  gridContinue: 'selectable-grid-continue-button',
  finishButton: 'onboarding-finish-button',
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

export const accounts = {
  fab: 'fab-button',
  tabAccounts: 'tab-item-accounts',
  submitFooter: 'submit-footer-button',
} as const;

export const budgets = {
  nameInput: 'hero-name-input',
  scheduleField: 'budget-schedule-field',
  intervalItem: (interval: string) => `budget-interval-type-item-${interval}`,
} as const;

export const plannedPayments = {
  fab: 'fab-button',
  heroName: 'hero-name-input',
  heroAmount: 'hero-amount-input',
  fromAccount: 'planned-payment-from-account',
  toAccount: 'planned-payment-to-account',
  submitFooter: 'submit-footer-button',
  schedule: 'planned-payment-repeat-count',
  scheduleDay: (day: number) => `schedule-day-${day}`,
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
