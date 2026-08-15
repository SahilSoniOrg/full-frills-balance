import { UI_STRINGS } from './copy/ui-strings';

/**
 * App Configuration - Behavior defaults and app-wide settings
 *
 * This file contains values that affect BEHAVIOR, not visual appearance or presentation copy.
 * Visual tokens belong in design-tokens.ts.
 * Presentation UI copy strings belong in src/constants/copy/ui-strings.ts.
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
      duplicateDetection: {
        scoreThreshold: 0.55,
        weightTime: 0.45,
        weightMerchant: 0.15,
        referenceMatchScore: 1,
        fingerprintDayBucketMs: 24 * 60 * 60 * 1000,
        fuzzyWindowMs: 4 * 60 * 60 * 1000,
      },
      batchOpChunkSize: 200,
    },
  },

  // Pagination
  pagination: {
    defaultPageSize: 20,
    dashboardPageSize: 15,
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
    enableSentry: !__DEV__, // Error tracking
    enablePostHog: !__DEV__, // Product analytics
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
    slowBalanceThresholdMs: 50,
    slowAggregateThresholdMs: 30,
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
    import: {
      /** Max parallel account balance rebuilds after a large import */
      postImportAccountRebuildConcurrency: 3,
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

  // UI Strings catalog (sourced from src/constants/copy/ui-strings.ts)
  strings: UI_STRINGS,

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
    /** Default AI model ID — used as the download prompt and initial model. Must be publicly accessible. */
    defaultAiModelId: 'qwen-2.5-1.5b',
    reportDays: 30,
    safeToSpendDays: 30,
    chartTickCount: 5,
    safeToSpendDaysCap: 99,
    reportMonthlyBucketThresholdDays: 60,
    journalPageSize: 20,
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
};
