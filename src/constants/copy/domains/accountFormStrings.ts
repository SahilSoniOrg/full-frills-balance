export const accountFormStrings = {
  kinds: {
    cash: 'Cash',
    wallet: 'Wallet',
    bank: 'Bank account',
    savings: 'Savings',
    creditCard: 'Credit card',
    loan: 'Loan',
  },
  assetCaption: 'Money you have',
  liabilityCaption: 'Money you owe',
  balanceNow: 'Balance right now',
  owedToday: 'Amount owed today',
  currentBalance: 'Current balance',
  addKind: (kind: string) => `Add ${kind}`,
  saveChanges: 'Save Changes',
  namePlaceholder: 'Name, like “HDFC Salary”',
  newKind: (kind: string) => `New ${kind}`,
  allKinds: 'All kinds',
  appearance: 'Customize account appearance',
  categoryAppearance: 'Customize category appearance',
  categoryKind: 'Category kind',
  incomeCategory: 'Income category',
  expenseCategory: 'Expense category',
  categoryParent: 'Inside another category',
  suggestion: (kind: string) => `Looks like a ${kind}.`,
  switchKind: 'Switch',
  optional: 'Optional',
  parent: 'Inside another account',
  noParent: 'No parent',
  none: 'None',
  add: 'Add',
  done: 'Done',
  closeSheet: 'Close account details',
  cardDetails: 'Card details',
  statementDay: 'Statement day',
  dueDay: 'Payment due',
  payFrom: 'Pay from',
  selectPayFrom: 'Select payment account',
  limitAndInterest: 'Limit and interest',
  projections: 'Used for repayment projections',
  creditLimit: 'Credit limit',
  creditLimitPlaceholder: 'Enter credit limit',
  apr: 'APR (%)',
  aprPlaceholder: 'e.g. 15.5',
  repayment: 'Repayment',
  payInFull: 'Pay in full',
  minimumOnly: 'Minimum only',
  repaymentHelp: 'Controls how much outflow is projected per cycle.',
  minAmount: 'Minimum payment amount',
  minAmountPlaceholder: 'e.g. 500',
  minPercent: 'Minimum payment (%)',
  minPercentPlaceholder: 'e.g. 5',
  minimumHelp: 'Projections use the higher of the amount or percentage.',
  loanDetails: 'Loan details',
  emiDay: 'EMI day',
  rateAndTerm: 'Rate and term',
  tenure: 'Tenure (months)',
  tenurePlaceholder: 'e.g. 36',
  emiAmount: 'Monthly EMI',
  emiAmountPlaceholder: 'Enter EMI amount',
  note: 'Note',
  notePlaceholder: 'Add any additional notes...',
  legacyNotes: 'Notes',
  legacyAdditionalInfo: 'Additional Info',
  categoryHierarchy: 'Hierarchy',
  lockedCurrency: (code: string) => `${code} (Locked)`,
  day: (day: number) => {
    const lastTwo = day % 100;
    const suffix =
      lastTwo >= 11 && lastTwo <= 13
        ? 'th'
        : day % 10 === 1
          ? 'st'
          : day % 10 === 2
            ? 'nd'
            : day % 10 === 3
              ? 'rd'
              : 'th';
    return `${day}${suffix}`;
  },
  lastDay: 'Last day',
} as const;
