export const onboarding = {
  screen: 'onboarding-screen',
  nameInput: 'onboarding-name-input',
  continueButton: 'onboarding-continue-button',
  gridContinue: 'selectable-grid-continue-button',
  themeContinue: 'onboarding-theme-continue-button',
  finishButton: 'onboarding-finish-button',
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
  amountInput: 'amount-input',
  descriptionInput: 'journal-description-input',
  submitFooter: 'submit-footer-button',
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
