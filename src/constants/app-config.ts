/**
 * App Configuration - Behavior defaults and app-wide settings
 * 
 * This file contains values that affect BEHAVIOR, not visual appearance.
 * Visual tokens belong in design-tokens.ts
 */

export const AppConfig = {
  // Default currency for new accounts
  defaultCurrency: 'USD' as const,

  // Default currency precision (decimal places)
  defaultCurrencyPrecision: 2,

  // Versioning
  appVersion: '1.0.0',

  // Animation durations (in ms)
  animation: {
    fast: 200,
    normal: 300,
    slow: 500,
  },

  // Navigation and UI timing
  timing: {
    successDelay: 1000,  // Delay after success before navigation
    loadingDelay: 500,   // Minimum loading time
    debounceMs: 300,    // Input debounce timing
  },

  // Input constraints
  input: {
    maxAccountNameLength: 100,
    maxDescriptionLength: 255,
    maxNotesLength: 500,
  },

  // Pagination
  pagination: {
    defaultPageSize: 20,
    dashboardPageSize: 50,
    maxPageSize: 100,
  },

  // Feature toggles
  features: {
    enableAnalytics: false,  // Analytics collection
    enableDebugMode: false,  // Debug logging
    enableExperimentalFeatures: false,
  },

  // Performance settings
  performance: {
    maxConcurrentOperations: 5,
    cacheTimeoutMs: 300000,  // 5 minutes
  },

  // External API endpoints
  api: {
    exchangeRateBaseUrl: 'https://api.exchangerate-api.com/v4/latest',
  },

  // Business Logic Constants
  constants: {
    precision: 2,
    validation: {
      minAccountNameLength: 2,
      maxAccountNameLength: 100,
      maxTrimLength: 500,
    },
  },

  // System Account Configuration
  systemAccounts: {
    openingBalances: {
      namePrefix: 'Opening Balances',
      icon: 'scale',
      description: 'System account for initial balances',
    },
    balanceCorrections: {
      namePrefix: 'Balance Corrections',
      icon: 'construct',
      description: 'System account for balance corrections',
      legacyNames: ['Balance Corrections', 'Balance Correction', 'Balance Corrections ()'],
    },
  },

  // UI Strings
  strings: {
    common: {
      loading: 'Loading...',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      allTime: 'All Time',
      searchPlaceholder: 'Search...',
    },
    dashboard: {
      emptyTitle: 'No transactions yet',
      emptySubtitle: 'Tap the + button to add your first transaction',
      recentTransactions: 'Recent Transactions',
      searchResults: 'Search Results',
      greeting: (name: string) => `Hi, ${name || 'there'}!`,
    },
    journal: {
      emptyTitle: 'No transactions found',
      emptySubtitle: 'Try adjusting your search or date filter',
      transactions: 'Transactions',
      searchResults: 'Search Results',
      more: (count: number) => `+${count} more`,
      from: 'From: ',
      to: 'To: ',
    },
    reports: {
      netWorthChange: 'NET WORTH CHANGE',
      totalIncome: 'TOTAL INCOME',
      totalExpense: 'TOTAL EXPENSE',
      incomeVsExpenseTrend: 'Income & Expense Trend',
      incomeBreakdown: 'Income Breakdown',
      spendingBreakdown: 'Spending Breakdown',
      noData: 'No expense data for this period.',
      showLess: 'Show Less',
      showAll: (count: number) => `Show All (${count})`,
    },
    settings: {
      title: 'Settings',
      sections: {
        general: 'General',
        appearance: 'Appearance',
        dataManagement: 'Data Management',
        maintenance: 'Maintenance',
        dangerZone: 'Danger Zone',
      },
      appearance: {
        themeTitle: 'Color Theme',
        themeDesc: 'Choose the color palette that suits your style.',
        typographyTitle: 'Typography',
        typographyDesc: 'Select the font family for headings and body text.',
        modeTitle: 'Mode',
        deepSpace: {
          label: 'Deep Space',
          desc: 'Dark blue tones, high contrast',
        },
        ivy: {
          label: 'Ivy',
          desc: 'Clean white, minimalist',
        },
        serifSans: {
          label: 'Serif & Sans',
          desc: 'DM Serif Display + Instrument Sans',
        },
        modernGeometric: {
          label: 'Modern Geometric',
          desc: 'Raleway everywhere',
        },
        customize: 'Customize',
        preview: 'Aa',
      },
      privacy: {
        title: 'Privacy Mode',
        description: 'Mask balances across the app',
        on: 'On',
        off: 'Off',
      },
      advancedMode: {
        title: 'Advanced Mode',
        description: 'Default to multi-line entry and raw account selection.',
      },
      stats: {
        title: 'Account Statistics',
        description: 'Show monthly income/expense on cards',
      },
      data: {
        exportDesc: 'Export your data as a JSON file for backup or external use.',
        exportBtn: 'Export to JSON',
        importBtn: 'Import from JSON',
        auditDesc: 'View all changes made to your data for auditing and debugging.',
        auditBtn: 'View Audit Log',
      },
      maintenance: {
        integrityDesc: 'Verify and repair account balance inconsistencies if needed.',
        integrityBtn: 'Fix Integrity Issues',
      },
      danger: {
        cleanupDesc: 'Permanently delete soft-deleted records to free up space.',
        cleanupBtn: 'Cleanup Deleted Data',
        resetDesc: 'Wipe all data and reset the app to its original state.',
        resetBtn: 'Factory Reset',
      },
      version: (v: string) => `Balance v${v}`,
      importTitle: 'Import Data',
      importIntro: 'Choose the format of your backup file to restore your data.',
      importNote: 'Note: Importing will replace all existing data on this device.',
      selectFile: (name: string) => `Select ${name} File`,
      currency: {
        title: 'Default Currency',
        description: 'Used for new accounts and total balance',
        selectTitle: 'Select Default Currency',
      },
    },
    transactionFlow: {
      amount: 'AMOUNT',
      schedule: 'SCHEDULE',
      descriptionOptional: 'DESCRIPTION (OPTIONAL)',
      saving: 'SAVING...',
      save: (type: string) => `SAVE ${type.toUpperCase()}`,
      chooseDifferentAccounts: 'CHOOSE DIFFERENT ACCOUNTS',
      fetchingRate: 'Fetching rate...',
      simple: 'Simple',
      advanced: 'Advanced',
      explanationIconAccessibility: 'What is Advanced Mode?',
    },
    advancedModeExplanation: {
      title: 'What is Advanced Mode?',
      intro: 'Most finance apps force you into a "One-to-One" mindset: you spend $X at a store from one account. If you paid using two different cards, you’d have to log two separate transactions.',
      unlocks: 'Advanced Mode unlocks "Multi-leg Journals" (atomic splits). This allows you to group any number of items into a single, balanced entry.',
      exampleTitle: 'The Example:',
      exampleScenario: 'Imagine you buy a $50 meal, but you pay $40 from your Bank and $10 in Cash.',
      exampleItems: [
        'Bank — Credit $40 (Money leaving bank)',
        'Cash — Credit $10 (Money leaving wallet)',
        'Food — Debit $50 (Expense increased)',
      ],
      whyBetterTitle: 'Why it’s better:',
      benefits: [
        'Atomic Transactions: The entry only saves if it "Balances" (Sum of Debits = Sum of Credits). Your books stay perfectly accurate.',
        'Clean Ledger: You see one $50 meal in your reports, not two disconnected fragments.',
        'Power Features: It\'s perfect for split bills, paychecks (Income minus Taxes), or complex transfers where fees are involved.',
      ],
      footer: 'Simple Mode is just a shortcut we built on top of this engine to handle the boring 90% of daily expenses, but Advanced is where the real power of the app\'s double-entry engine lives.',
    },
    accounts: {
      types: {
        asset: 'Asset',
        liability: 'Liability',
        equity: 'Equity',
        income: 'Income',
        expense: 'Expense',
      },
      selectCurrency: 'Select Currency',
      form: {
        accountName: 'Account Name',
        accountNamePlaceholder: 'e.g., Checking Account',
        accountType: 'Account Type',
        currentBalance: 'Current Balance',
        initialBalance: 'Initial Balance',
        balancePlaceholder: '0.00',
        parentAccount: 'Parent Account (Optional)',
        clear: 'Clear',
      },
      hierarchy: {
        title: 'Manage Hierarchy',
        description: 'Select an account to move it, or create a new parent organizational account.',
        newParentButton: 'New Parent Account',
        addChild: 'Add child account...',
        modalTitle: 'Hierarchy Builder',
        modalDescription: (accountName: string) => `Configure structure for "${accountName}"`,
        addChildrenLabel: 'ADD AVAILABLE ACCOUNTS AS CHILDREN:',
        moveParentLabel: 'MOVE UNDER ANOTHER PARENT:',
        hasTransactions: 'Has Transactions',
      },
    },
    advancedEntry: {
      createTitle: 'Create Journal Entry',
      editTitle: 'Edit Journal Entry',
      dateTime: 'Date & Time',
      description: 'Description',
      descriptionPlaceholder: 'Enter description',
      journalLines: 'Journal Lines',
      addLine: '+ Add Line',
      addLineAccessibility: 'Add line',
      lineTitle: (index: number) => `Line ${index}`,
      removeLine: 'Remove',
      selectAccount: 'Select Account',
      type: 'Type',
      debit: 'Debit',
      credit: 'Credit',
      amountPlaceholder: '0.00',
      notes: 'Notes',
      notesPlaceholder: 'Optional notes',
      exchangeRate: 'Exchange Rate (Optional)',
      autoFetch: 'Auto-fetch',
      ratePlaceholder: 'e.g., 1.1050',
      rateHelpSame: 'Not needed (same as base currency)',
      rateHelpConvert: (from: string, to: string) => `Rate to convert ${from} to ${to}`,
      updating: 'Updating...',
      creating: 'Creating...',
      updateJournal: 'Update Journal',
      createJournal: 'Create Journal',
      editing: 'EDITING',
    },
    onboarding: {
      iconPickerTitle: 'Select Icon',
      splash: {
        title: 'Welcome\nto Balance',
        subtitle: "Let's personalize your experience.",
        inputLabel: 'What should we call you?',
        inputPlaceholder: 'Enter your name',
        btnGetStarted: 'Get Started',
        dividerOr: 'OR',
        btnRestore: 'Restore Backup',
      },
      currency: {
        title: 'Default Currency',
        subtitle: 'Select your primary currency. You can add more later.',
        searchPlaceholder: 'Search currency...',
      },
      accounts: {
        title: 'Setup Accounts',
        subtitle: 'Where is your money? Select all that apply.',
        placeholder: 'Add custom account...',
      },
      categories: {
        title: 'Setup Categories',
        subtitle: 'Select categories you use often.',
        placeholder: 'Add category...',
        typeLabels: { income: 'Income', expense: 'Expense' },
      },
      finalize: {
        title: 'All Ready!',
        subtitle: "Your accounts are set up and ready to go. Let's start tracking your balance.",
        btnFinish: "Let's Begin",
      },
    },
    journalSummary: {
      title: 'Summary',
      totalDebits: 'Total Debits:',
      totalCredits: 'Total Credits:',
      balance: 'Balance:',
      balanced: (curr: string) => `✓ Journal is balanced in ${curr}`,
      unbalanced: (curr: string) => `✗ Journal must be balanced in ${curr}`,
    },
    validation: {
      accountNameRequired: 'Account name is required',
      accountNameTooShort: (min: number) => `Account name must be at least ${min} characters`,
      accountNameTooLong: (max: number) => `Account name must be less than ${max} characters`,
      invalidCharacters: 'Account name contains invalid characters',
    },
    audit: {
      logTitle: 'Audit Log',
      editHistory: 'Edit History',
      emptyLogs: 'No audit logs found',
      viewDetails: 'View details',
      idLabel: (id: string) => `ID: ${id}`,
      typeChanged: '(type changed)',
      transactionsLabel: 'transactions:',
      tables: ['journals', 'transactions', 'accounts'],
      errors: {
        notFound: (id: string) => `Entity ${id} not found`,
        loadFailed: 'Failed to load audit logs',
      },
    },
    formats: {
      date: 'YYYY-MM-DD',
    },
    maintenance: {
      importSuccess: 'Import Successful',
      resetComplete: 'Factory Reset Complete',
      importDesc: 'Your data has been successfully imported into the local database.',
      resetDesc: 'All data, accounts, and settings have been permanently erased.',
      stats: {
        accounts: 'Accounts',
        journals: 'Journals',
        transactions: 'Transactions',
        auditLogs: 'Audit Logs',
        skippedItems: 'Skipped Items',
      },
      restartNote: 'A restart is required to finalize changes and re-initialize the application engine.',
      restartBtn: 'Restart App',
    },
  },

  // Layout Constants
  layout: {
    maxContentWidth: 400,
    modalHeightPercent: '70%',
    hierarchyModalHeightPercent: '80%',
    iconCircleSize: 32, // Match Size.iconLg or similar
    finalizeIconSize: 84, // Size.xxl * 2 or similar
    finalizeSubtitleMaxWidth: 300,
  },

  // Default Values
  defaults: {
    reportDays: 30,
  },
} as const
