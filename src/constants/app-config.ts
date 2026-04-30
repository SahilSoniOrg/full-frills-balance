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
  // Default locale for formatting
  defaultLocale: 'en-IN',

  // Privacy masking
  privacyMask: '\u2022\u2022\u2022\u2022',

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
    successDelay: 1000, // Delay after success before navigation
    loadingDelay: 500, // Minimum loading time
    debounceMs: 300, // Input debounce timing
    focusDelayMs: 100,
    toastDurationMs: 3000,
    appLockGracePeriodMs: 10000,
    appLockAuthTransitionMs: 500,
    appLockFadeDurationMs: 400,
    bootWatchdogMs: 5000,
  },

  // Input constraints
  input: {
    maxAccountNameLength: 100,
    maxDescriptionLength: 255,
    maxNotesLength: 500,
    maxDayOfMonthLength: 2,
    sms: {
      maxSenderMatchLength: 100,
      maxBodyMatchLength: 1000,
      maxStoredProcessedIds: 1000,
      previewBodyChars: 100,
    },
  },

  // Pagination
  pagination: {
    defaultPageSize: 20,
    dashboardPageSize: 50,
    maxPageSize: 100,
    budgetDetailsTransactionsPageSize: 1000,
    auditRecentLimit: 100,
    auditScreenLimit: 200,
    smsImportScanLimit: 50,
    smsImportSheetLimit: 200,
  },

  // Feature toggles
  features: {
    enableAnalytics: true, // Analytics collection
    enableDebugMode: false, // Debug logging
    enableExperimentalFeatures: false,
    debug: {
      safeToSpendLogs: false,
      tracePerformance: true,
    },
  },

  // Performance settings
  performance: {
    maxConcurrentOperations: 5,
    cacheTimeoutMs: 300000, // 5 minutes
    slowTraceThresholdMs: 200,
    rebuild: {
      checkpointInterval: 1000,
      batchSize: 500,
      queue: {
        debounceMs: 500,
        maxBatchSize: 50,
        retryLimit: 3,
        retryDelayMs: 2000,
      },
    },
    ghostStepYieldMs: 20, // Small yield between major ghost hydration steps
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
      minDayOfMonth: 1,
      maxDayOfMonth: 31,
      minAprPercent: 0,
      maxAprPercent: 100,
    },
  },

  // System Account Configuration
  systemAccounts: {
    openingBalances: {
      namePrefix: 'Opening Balances',
      icon: 'scale',
      description: 'System account that stores opening balances',
    },
    balanceCorrections: {
      namePrefix: 'Balance Corrections',
      icon: 'wrench',
      description: 'System account that stores balance corrections',
      legacyNames: ['Balance Corrections', 'Balance Correction', 'Balance Corrections ()'],
    },
  },

  // UI Strings
  strings: {
    common: {
      loading: 'Loading…',
      loadingMore: 'Loading…',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      alert: 'Alert',
      confirm: 'Confirm',
      ok: 'OK',
      noTransactions: 'Your financial story starts here.',
      tryChangingFilters: 'No results match these filters',
      allTime: 'All Time',
      searchPlaceholder: 'Search…',
      none: 'None',
    },
    dashboard: {
      emptyTitle: 'Everything is ready.',
      emptySubtitle: 'Add your first entry to see how much you can spend with confidence.',
      recentTransactions: 'Activity',
      searchResults: 'Results',
      greeting: (name: string) => `Hi, ${name || 'there'}`,
      notificationsTitle: 'Notifications',
      safeToSpendTitle: 'Safe to Spend',
      triggeringTransactionsTitle: 'Source Activity',
      dismissedNotificationsTitle: 'Dismissed',
      noDismissedNotifications: 'No dismissed notifications.',
      restore: 'Restore',
      manageDismissed: 'Manage',
      assets: 'Available Now',
      debts: 'Outstanding',
      budgets: 'Reserved',
      bills: 'Bills',
      shortfall: 'Shortfall',
      neededForObligations: 'Reserved',
      afterObligations: 'Remaining',
      insightDetails: {
        title: 'Why This Changed',
        emptyTitle: 'No source activity',
        emptySubtitle: 'The entries behind this item are no longer in your ledger.',
        impact: 'Effect on Safe to Spend',
        whyThisAppeared: 'Reason: ',
        recommendedAction: 'What happens next',
        basisText: (days: number) => `Based on the last ${days} days`,
        severityLabel: {
          high: 'Large effect',
          medium: 'Moderate effect',
          low: 'Small effect',
        },
      },
      noDataForBreakdown:
        'Safe to Spend is below zero, so there is no available balance to break down.',
      safeToSpendExplanation: {
        title: 'How Safe to Spend Is Calculated',
        intro:
          'Safe to Spend is the money left after pending charges, upcoming bills, and other committed amounts are counted.',
        unlocks:
          'The number is conservative. If money may be needed soon, it is not treated as free to spend.',
        formulaTitle: 'Calculation',
        formulaItems: [
          'Available now: cash and cash-like account balances you can use soon.',
          (days: number) =>
            `Incoming: expected pay, refunds, and transfers scheduled within ${days} days.`,
          (days: number) =>
            `Reserved: bills, planned payments, transfers, and budgeted spending expected within ${days} days.`,
          'Outstanding debt: balances you still owe. Only the amount due soon reduces Safe to Spend.',
          'Safe to Spend: what remains after those amounts are counted.',
        ],
        bucketTitle: 'Breakdown',
        exampleTitle: 'Current Breakdown',
        benefitsTitle: 'Why These Amounts Are Separate',
        benefits: [
          'Available money is shown after committed money is removed.',
          'Pending and scheduled items affect the number before they settle.',
          'You can open any amount to see the entries behind it.',
        ],
        footer:
          'This calculation depends on account subtypes, planned payments, and budget scopes.',
        closeCta: 'Close',
      },
      legendDetails: {
        safeTitle: 'Safe to Spend',
        safeDesc: (days: number) =>
          `Money left after funds are reserved for the next ${days} days.`,
        committedTitle: 'Reserved',
        committedDesc: (days: number) =>
          `Money set aside for planned payments, transfers, and active budgets in the next ${days} days.`,
        debtsTitle: 'Outstanding',
        debtsDesc: (days: number) =>
          `Balances you still owe. The amount due within ${days} days is already included in Reserved.`,
        inflowTitle: 'Incoming',
        inflowDesc: (days: number) => `Expected income and transfers within ${days} days.`,
      },
      safeToSpendUi: {
        safePrefix: 'Safe to Spend:',
        committedPrefix: 'Reserved:',
        debtsPrefix: 'Outstanding:',
        inflowPrefix: 'Incoming:',
        financiallySecure: 'Available',
        assetsBucket: 'Available Now',
        debtsBucket: 'Outstanding Debt',
        debtsHint: 'Balances you still owe and have not matched to a repayment plan.',
        debtsCallout:
          'The due amount is already included in Reserved because a repayment plan exists.',
        budgetsBucket: 'Budget Reserves',
        categoriesUsed: 'Categories used',
        accountsUsed: 'Accounts used',
        noneDetectedYet: 'None found',
        projectedLiquidity: 'Projected available money (Available Now + Incoming):',
        committedLine: 'Reserved (budgets + planned payments):',
        debtsLine: 'Outstanding debt (no repayment plan):',
        safeToSpendLine: 'Safe to Spend:',
        calculationTitle: 'Calculation',
        calculationFormula: "Lower of today's available money and the lowest projected balance",
        plannedPayments: 'Planned payments',
        plannedJournals: 'Planned transfers',
        activeBudgets: (days: number) => `Budget reserves (${days} days)`,
        breakdownByAccount: 'By account',
        totalCommitted: 'Total reserved',
        creditCardStatements: 'Card statements',
        otherLiquidLiabilities: 'Other near-term liabilities',
        totalBalanceInfo: 'Total balance',
        upcomingIncome: 'Incoming',
        emptyAccounts: 'No accounts in this group',
        noFutureIncome: 'No incoming money is scheduled',
        remainingCashBuffer: 'Remaining buffer',
        unplannedBalance: 'Unreserved balance',
        scheduledCommitment: 'Scheduled amount',
        waitingForIncome: 'Incoming needed',
        calculationLedger: 'Calculation details',
        projectedLabel: 'Projected',
      },
      hub: {
        title: 'Review',
        activeTab: 'Active',
        dismissedTab: 'Dismissed',
        unreadSmsTitle: (count: number) =>
          `${count} SMS ${count === 1 ? 'message needs' : 'messages need'} review`,
        unreadSmsSubtitle: 'These messages may create entries after review.',
        emptyState: 'No active items.',
        noDismissed: 'No dismissed items.',
        restore: 'Restore',
        dismiss: 'Dismiss',
        emergencyFund: {
          title: 'No Emergency Fund Account Found',
          description: 'No asset account is marked as Emergency Fund.',
          highlight: 'An emergency fund is money set aside for unexpected costs.',
          fixTitle: 'If you add one',
          step1: 'Create an asset account.',
          step2: 'Choose the Emergency Fund subtype.',
          step3: 'Transfers into that account stay separate from spending money.',
          actionClose: 'Close',
          actionCreate: 'Create account',
          insight: {
            message: 'No Emergency Fund Account Found',
            description: 'No asset account is marked as Emergency Fund.',
            suggestion: 'This appears because the app could not find an Emergency Fund account.',
          },
        },
        subscriptionAmnesia: {
          message: 'Recurring Charge',
          description: (amount: string, desc: string, acc: string) =>
            `${amount} for "${desc}" in "${acc}" appears repeatedly.`,
          suggestion: 'This appears because similar charges were found more than once.',
        },
        spendingSpike: {
          message: 'Higher-Than-Usual Spending',
          description: (subtype: string, percent: number) =>
            `"${subtype}" is ${percent}% above your usual level.`,
          suggestion: 'This is based on recent activity in the same category.',
        },
      },
      notifications: {
        impact: 'Effect',
        whyThisAppeared: 'Reason: ',
        basedOnLastDays: (days: number) => `Based on the last ${days} days`,
        triggersCount: (count: number) => (count === 1 ? '1 trigger' : `${count} triggers`),
        nextStep: 'Next: ',
        planEmergencyFund: 'Emergency Fund account not found',
      },
    },
    journal: {
      emptyTitle: 'No matching entries',
      emptySubtitle: 'No entries match the current search or date range.',
      transactions: 'Activity',
      plannedPayments: 'Planned payments',
      upcoming: 'Scheduled',
      searchResults: 'Results',
      more: (count: number) => `+${count} more`,
      from: 'From: ',
      to: 'To: ',
      transaction: 'Entry',
      transfer: 'Transfer',
      expense: 'Expense',
      income: 'Income',
      transactionCount: (count: number) => (count === 1 ? '1 entry' : `${count} entries`),
      reconciledUntilHere: (dateText: string) => `Reconciled through ${dateText}`,
      errors: {
        missingExchangeRate: (from: string, to: string) =>
          `No exchange rate from ${from} to ${to} was available, so this transaction was left out of the daily net amount.`,
      },
    },
    reports: {
      title: 'Reports',
      netWorthChange: 'Net Worth Change',
      totalIncome: 'Income',
      totalExpense: 'Expense',
      incomeVsExpenseTrend: 'Income vs Expense',
      incomeBreakdown: 'Income Breakdown',
      spendingBreakdown: 'Spending Breakdown',
      noData: 'No data in this period.',
      showLess: 'Less',
      showAll: (count: number) => `All (${count})`,
    },
    settings: {
      title: 'Settings',
      sections: {
        personalization: 'Personalization',
        preferences: 'Preferences',
        communitySupport: 'Community',
        general: 'General',
        appearance: 'Appearance',
        dataManagement: 'Data',
        maintenance: 'Maintenance',
        dangerZone: 'Danger Zone',
      },
      appearance: {
        themeTitle: 'Color Theme',
        themeDesc: 'Set the palette for your interface',
        typographyTitle: 'Typography',
        typographyDesc: 'Heading and body typeface',
        modeTitle: 'Mode',
        deepSpace: {
          label: 'Deep Space',
          desc: 'Dark blue, high contrast',
        },
        ivy: {
          label: 'Ivy',
          desc: 'Clean white, minimal',
        },
        editorial: {
          label: 'Editorial',
          desc: 'Slate, warm, professional',
        },
        goldObsidian: {
          label: 'Gold Obsidian',
          desc: 'Deep gold and obsidian',
        },
        serifSans: {
          label: 'Serif & Sans',
          desc: 'DM Serif Display + Instrument Sans',
        },
        modernGeometric: {
          label: 'Modern Geometric',
          desc: 'Raleway everywhere',
        },
        classicSerif: {
          label: 'Classic Serif',
          desc: 'Crimson Text + Inter',
        },
        customize: 'Customize',
        preview: 'Aa',
      },
      privacy: {
        title: 'Privacy Mode',
        description: 'Hide balances across the app',
        on: 'On',
        off: 'Off',
        widgetPrivacyTitle: 'Widget Privacy',
        widgetPrivacyDesc: 'Hide balances on home screen widgets',
      },
      advancedMode: {
        title: 'Advanced Mode',
        description: 'Use multi-line journal entries and choose every account directly.',
      },
      stats: {
        title: 'Account Stats',
        description: 'Show monthly income and expense on account cards',
      },
      data: {
        exportDesc: 'Export your ledger to a JSON backup file.',
        exportBtn: 'Create Backup',
        exportFilenameLabel: 'Filename',
        exportFilenamePlaceholder: 'e.g., my-balance-backup',
        importBtn: 'Restore Backup',
        auditDesc: 'See every recorded change to your data.',
        auditBtn: 'Audit Trail',
        shareFormatTitle: 'Default Share Format',
        shareFormatDesc: 'Format used when sharing reports',
        shareFormats: {
          TEXT: 'Text',
          CSV: 'CSV',
          MARKDOWN: 'Markdown',
        },
      },
      maintenance: {
        integrityDesc: 'Check your ledger for balance mismatches and repair what can be repaired.',
        integrityBtn: 'Verify Books',
        integrityTitle: 'Verifying Books',
        integrityWait: 'Checking balances…',
        integrityHint: 'This check runs while the app stays open.',
      },
      danger: {
        cleanupDesc: 'Permanently remove records already marked deleted.',
        cleanupBtn: 'Purge Deleted',
        resetDesc: 'Erase all data. This is irreversible.',
        resetBtn: 'Factory Reset',
      },
      version: (v: string) => `Full Frills Balance v${v}`,
      personalization: {
        yourName: 'Your Name',
        yourNamePlaceholder: 'Enter your name',
        themeTypographyTitle: 'Theme & Typography',
        themeTypographyDesc: 'Colors, fonts, dark mode',
        smsAutoPostTitle: 'SMS Auto-Post',
        smsAutoPostDesc: 'Rules that turn reviewed SMS messages into entries automatically',
        forecastTitle: 'Simulation Horizon',
        forecastDesc:
          'Determines how far into the future your balance is projected to calculate Safe-to-Spend.',
      },
      community: {
        telegramTitle: 'Telegram',
        telegramDesc: 'Updates and discussion',
        playStoreTitle: 'Rate on Play Store',
        playStoreDesc: 'Open app page',
        githubTitle: 'GitHub',
        githubDesc: 'Source code and issues',
      },
      importTitle: 'Import',
      importIntro: 'Choose a backup format to replace the data on this device.',
      importNote: 'Import replaces all existing data on this device.',
      selectFile: (name: string) => `Select ${name} File`,
      currency: {
        title: 'Default Currency',
        description: 'Used for new accounts and totals',
        selectTitle: 'Select Currency',
      },
      notifications: {
        title: 'Reminders',
        description: 'Reminder to review recent activity so Safe to Spend stays current',
        cadenceLabel: 'Cadence',
        none: 'None',
        daily: 'Daily',
        weekly: 'Weekly',
        reminderTitle: 'Review recent activity',
        reminderBody: 'Record recent entries to keep Safe to Spend current.',
        testTitle: 'Test Reminder',
        testBody: 'This is a test notification from Full Frills Balance.',
      },
    },
    transactionFlow: {
      amount: 'Amount',
      descriptionOptional: 'Description',
      saving: 'Saving…',
      save: (type: string) => `Save ${type.toUpperCase()}`,
      continue: 'Continue',
      chooseDifferentAccounts: 'Change accounts',
      fetchingRate: 'Getting exchange rate…',
      simple: 'Simple',
      advanced: 'Advanced',
      explanationIconAccessibility: 'What is Advanced Mode?',
      headers: {
        edit: 'Edit Entry',
        new: 'New Entry',
        default: 'Journal Entry',
      },
      banners: {
        editing: 'Editing this entry',
      },
    },
    advancedModeExplanation: {
      title: 'Advanced Mode',
      intro:
        'Simple mode records one account in and one account out. Advanced mode supports journal entries with multiple lines.',
      unlocks: 'The entry saves only when total debits equal total credits.',
      exampleTitle: 'Example',
      exampleScenario: '$50 meal paid with $40 from Bank and $10 from Cash.',
      exampleItems: [
        'Bank - Credit $40 (money leaving the account)',
        'Cash - Credit $10 (money leaving the account)',
        'Food - Debit $50 (the expense recorded in the ledger)',
      ],
      whyBetterTitle: 'Why It Exists',
      benefits: [
        'One entry can affect multiple accounts.',
        'The ledger stays balanced because total debits and credits must match.',
        'Useful for split payments, transfers with fees, and payroll entries.',
      ],
      footer: 'Simple mode covers standard entries. Advanced mode is for multi-line journals.',
    },
    accounts: {
      types: {
        asset: 'Asset',
        liability: 'Liability',
        equity: 'Equity',
        income: 'Income',
        expense: 'Expense',
      },
      selectCurrency: 'Currency',
      form: {
        accountName: 'Account Name',
        accountNamePlaceholder: 'e.g., Bank',
        accountType: 'Type',
        accountSubtype: 'Subtype',
        currentBalance: 'Current Balance',
        initialBalance: 'Initial Balance',
        balancePlaceholder: '0.00',
        parentAccount: 'Parent Account',
        clear: 'Clear',
        payDebtFrom: 'Pay Debt From',
        selectPaymentAccount: 'Select Payment Account',
        currencyLockedTooltip:
          'Currency cannot be changed once an account is created to maintain data integrity.',
      },
      hierarchy: {
        title: 'Hierarchy',
        description: 'Drag accounts to reorder them or place them under a parent account.',
        newParentButton: 'New Parent',
        addChild: 'Add child…',
        modalTitle: 'Hierarchy Builder',
        modalDescription: (accountName: string) => `Structure for "${accountName}"`,
        addChildrenLabel: 'ADD AS CHILDREN:',
        moveParentLabel: 'MOVE UNDER PARENT:',
        hasTransactions: 'Has Activity',
      },
      reconciliation: {
        reconciledLabel: (date: string) => `Reconciled through ${date}`,
        alert: {
          title: 'Reconcile Account',
          message:
            'Reconciliation means matching this account to your bank or card statement. Saving it creates a checkpoint at this balance.',
          successMessage: 'Reconciliation saved.',
          pendingTransactions: (count: number) =>
            `${count} ${count === 1 ? 'entry is' : 'entries are'} still unreconciled since the last checkpoint.`,
          matchingBalance: (balance: string) => `Statement balance: ${balance}`,
          guide: 'If the statement balance matches, confirm below.',
        },
      },
    },
    advancedEntry: {
      createTitle: 'New Journal',
      editTitle: 'Edit Journal',
      dateTime: 'Date & Time',
      description: 'Description',
      descriptionPlaceholder: 'What is this journal entry for?',
      journalLines: 'Journal Lines',
      addLine: '+ Add Line',
      addLineAccessibility: 'Add line',
      lineTitle: (index: number) => `Line ${index}`,
      removeLine: 'Remove',
      selectAccount: 'Account',
      type: 'Type',
      debit: 'Debit',
      credit: 'Credit',
      amountPlaceholder: '0.00',
      notes: 'Notes',
      notesPlaceholder: 'Optional notes',
      exchangeRate: 'Exchange Rate',
      autoFetch: 'Get rate',
      ratePlaceholder: 'e.g., 1.1050',
      rateHelpSame: 'Not needed for the same currency',
      rateHelpConvert: (from: string, to: string) => `${from} to ${to} exchange rate`,
      updating: 'Updating…',
      creating: 'Creating…',
      updateJournal: 'Save Changes',
      createJournal: 'Post Journal',
      editing: 'Editing',
    },
    onboarding: {
      iconPickerTitle: 'Select Icon',
      splash: {
        title: 'See What Is\nActually Available',
        subtitle:
          'Safe to Spend removes pending charges, bills, and committed money from the number you see.',
        inputLabel: 'Your name',
        inputPlaceholder: 'Enter your name',
        btnGetStarted: 'Set up app',
        dividerOr: 'OR',
        btnRestore: 'Restore Backup',
      },
      currency: {
        title: 'Choose Your Currency',
        subtitle: 'This is the main currency for new accounts. You can add others later.',
        searchPlaceholder: 'Search currencies…',
      },
      accounts: {
        title: 'Add Your Accounts',
        subtitle: 'Start with the accounts that hold or owe money.',
        placeholder: 'Add account…',
      },
      categories: {
        title: 'Add Your Categories',
        subtitle: 'Choose the income and expense categories you want to track.',
        placeholder: 'Add category…',
        typeLabels: { income: 'Income', expense: 'Expense' },
      },
      appearance: {
        title: 'Choose Appearance',
        subtitle: 'Set colors and type. You can change them later.',
        themeTitle: 'Theme',
        fontTitle: 'Typography',
        previewLabel: 'Preview',
        previewDesc: 'Safe to Spend example',
      },
      finalize: {
        title: 'Setup Complete',
        subtitle: "Setup complete. You're now ready to see what is actually available.",
        btnFinish: 'Open App',
      },
    },
    journalSummary: {
      title: 'Summary',
      totalDebits: 'Debits:',
      totalCredits: 'Credits:',
      balance: 'Balance:',
      balanced: (curr: string) => `Balanced in ${curr}`,
      unbalanced: (curr: string) => `Does not balance in ${curr}`,
    },
    validation: {
      accountNameRequired: 'Enter an account name',
      accountNameTooShort: (min: number) => `Use at least ${min} characters`,
      accountNameTooLong: (max: number) => `Use ${max} characters or fewer`,
      invalidCharacters: 'This name contains characters the app cannot save',
      simpleModeTooManyLines: 'Simple mode supports max 2 lines.',
    },
    audit: {
      logTitle: 'Audit Trail',
      editHistory: 'History',
      emptyLogs: 'No audit records yet',
      viewDetails: 'Details',
      viewCta: 'View',
      revertCta: 'Undo',
      revertConfirmTitle: 'Undo Change?',
      revertConfirmMessage:
        'This will attempt to revert the record to its previous state. Continue?',
      revertSuccess: 'Change undone successfully',
      idLabel: (id: string) => `ID: ${id}`,
      typeChanged: '(type changed)',
      transactionsLabel: 'entries:',
      accountPrefix: 'Account ',
      entityLabels: {
        account: 'Account',
        journal: 'Journal',
        transaction: 'Entry',
      } as Record<string, string>,
      tables: ['journals', 'transactions', 'accounts'],
      errors: {
        notFound: (id: string) => `No audit record found for ${id}`,
        loadFailed: 'The audit trail could not be loaded.',
        revertFailed: 'Failed to undo change',
        journalDeleteRevertNotSupported:
          'Restoring deleted journals is not yet supported via audit logs. Please use a backup.',
        revertTypeNotSupported: (type: string) => `Reverting ${type} is not supported yet`,
      },
    },
    formats: {
      date: 'YYYY-MM-DD',
    },
    maintenance: {
      importSuccess: 'Import Complete',
      resetComplete: 'Reset Complete',
      importDesc: 'The backup replaced the data stored on this device.',
      resetDesc: 'All data on this device was permanently erased.',
      stats: {
        accounts: 'Accounts',
        journals: 'Journals',
        transactions: 'Entries',
        budgets: 'Budgets',
        auditLogs: 'Audit Logs',
        plannedPayments: 'Planned Payments',
        skippedItems: 'Skipped',
      },
      restartNote: 'Restart the app to finish applying this change.',
      restartBtn: 'Restart',
    },
    plannedPayments: {
      title: 'Planned Payments',
      details: {
        screenTitle: 'Planned Payment Details',
        deleteConfirmTitle: 'Delete Planned Payment',
        deleteConfirmMessage: 'This permanently removes this planned payment rule.',
        postNowTitle: 'Post Planned Payment Now',
        skipTitle: 'Skip This Occurrence',
        skipConfirm: 'Skip Occurrence',
      },
      emptyTitle: 'No Planned Payments',
      emptySubtitle: 'Recurring rules you create will appear here.',
      nameLabel: 'Rule Name',
      namePlaceholder: 'e.g., Monthly Rent',
      amountLabel: 'Amount',
      amountPlaceholder: '0.00',
      fromAccountLabel: 'From',
      toAccountLabel: 'To',
      selectAccount: 'Account',
      recurrenceTitle: 'Recurrence',
      intervalLabel: 'Interval',
      autoPostLabel: 'Post Automatically',
      saveLabel: 'Save Rule',
      savingLabel: 'Saving…',
      nextOccurrence: (date: string) => `Next occurrence: ${date}`,
      everyDay: 'Daily',
      everyWeek: 'Weekly',
      everyMonth: 'Monthly',
      everyYear: 'Yearly',
      everyN: (n: number, type: string) => `Every ${n} ${type}s`,
      statusPaused: 'Paused',
      formTitleNew: 'New Rule',
      formTitleEdit: 'Edit Rule',
      dayOfWeek: 'Day of Week',
      dayOfMonth: 'Day of Month (1-31)',
      month: 'Month',
      selectMonth: 'Month',
      monthNames: [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ],
      dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    },
    budget: {
      details: {
        deleteTitle: 'Delete Budget',
        deleteConfirm: 'This permanently removes this budget.',
      },
      formTitleNew: 'New Budget',
      formTitleEdit: 'Edit Budget',
    },
    alerts: {
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: 'Info',
      validationError: 'Validation Error',
      databaseError: 'Database Error',
      connectionError: 'Connection Error',
      genericError: 'The request did not finish, so nothing was changed.',
      databaseErrorMessage: 'The change could not be saved to local storage.',
      networkErrorMessage: 'The app could not reach the network.',
    },
  },

  // Layout Constants
  layout: {
    maxContentWidth: 400,
    popupModalMaxWidth: 460,
    popupModalHeightPercent: 84,
    safeToSpendChartHeight: 150,
    modalHeightPercent: '70%',
    hierarchyModalHeightPercent: '80%',
    iconCircleSize: 32, // Match Size.iconLg or similar
    finalizeIconSize: 84, // Size.xxl * 2 or similar
    finalizeSubtitleMaxWidth: 300,
    toastTopOffset: 60,
  },

  // Default Values
  defaults: {
    reportDays: 30,
    safeToSpendDays: 30,
    chartTickCount: 5,
    safeToSpendDaysCap: 99,
    reportMonthlyBucketThresholdDays: 60,
    journalPageSize: 50,
    insightDetailsFetchLimit: 100,
    plannedJournalLimit: 10,
    simulation: {
      majorInflowThreshold: 200,
      edgeCaseBufferMs: 1 * 60 * 60 * 1000, // 1 hour
      financialEpsilon: 0.01,
      loanHeuristicTermMonths: 120, // 10 years
      loanHeuristicLabelSuffix: ' (Est. EMI)',
    },
    maxTooltipDetails: 6,
    budgetMode: 'SMOOTHED' as 'SMOOTHED' | 'ACTUAL',
    archetype: 'balance-glancer',
    notifications: {
      defaultHour: 10,
      defaultMinute: 0,
      defaultWeekday: 1,
    },
  },
  // Insight Configuration
  insights: {
    lookbackDays: 90,
    refreshIntervalMs: 60 * 60 * 1000,
    observeDebounceMs: 400,
    patternDebounceMs: 500,
    minRecurringIntervalDays: 25,
    maxRecurringIntervalDays: 35,
    minAnnualRecurringIntervalDays: 360,
    maxAnnualRecurringIntervalDays: 370,
    minRecurringCount: 3,
    spendingSpikeMultiplier: 1.5,
    spendingSpikeSeverityThreshold: 1000,
    spikeWindowDays: 7,
    recurringHorizonDays: 25,
    maxPlannedPaymentGenerations: 365,
    liabilityDefaultDueDay: 20,
    liabilityFallbackDeductionDay: 28,
    liabilityErrorFallbackOffsetDays: 15,
    liabilityCommitmentTolerance: 0.01,
    useConstant30DayBurn: true,
    constantDaysInMonth: 30,
    burnRateLookbackMinDays: 7,
  },
  dateTimePicker: {
    hoursInDay: 24,
    minutesInHour: 60,
    columnHeight: 150,
    containerHeight: 180,
    labelHeight: 30,
    scrollSnapDelayMs: 100,
  },
  toast: {
    animationDurationMs: 200,
    enterOffsetY: 20,
  },
  time: {
    msPerMinute: 60 * 1000,
    msPerHour: 60 * 60 * 1000,
    msPerDay: 24 * 60 * 60 * 1000,
    daysPerWeek: 7,
  },
} as const;
