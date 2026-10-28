import { Icon, type IconName } from '@/src/types/domainIcons';
import { UI_STRINGS } from './copy/ui-strings';

const isDevelopmentBuild =
  __DEV__ ||
  process.env.EXPO_PUBLIC_APP_VARIANT === 'development' ||
  process.env.APP_VARIANT === 'development';
const enableAnalyticsInDev = process.env.EXPO_PUBLIC_ENABLE_ANALYTICS_IN_DEV === '1';
const analyticsEnabled = !isDevelopmentBuild || enableAnalyticsInDev;

export const AppConfig = {
  // Default currency for new accounts
  defaultCurrency: 'USD' as const,

  // Default locale for formatting
  defaultLocale: 'en-IN',

  // Privacy masking
  privacyMask: '\u2022\u2022\u2022\u2022',

  // Versioning
  appVersion: '1.0.0',

  // Animation durations (in ms)
  animation: {
    normal: 300,
  },

  // Navigation and UI timing
  timing: {
    /** Brief pause so save CTA settle is perceptible before leave. */
    saveConfirmMs: 320,
    focusDelayMs: 100,
    toastDurationMs: 3000,
    appLockGracePeriodMs: 10000,
    appLockFadeDurationMs: 400,
  },

  // Input constraints
  input: {
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
        redeliveryWindowMs: 10 * 1000,
        fuzzyWindowMs: 4 * 60 * 60 * 1000,
      },
      batchOpChunkSize: 200,
    },
  },

  // Pagination
  pagination: {
    dashboardPageSize: 15,
    budgetDetailsTransactionsPageSize: 1000,
    auditRecentLimit: 100,
    auditScreenLimit: 200,
    smsImportScanLimit: 50,
  },

  features: {
    enableSentry: analyticsEnabled && process.env.EXPO_PUBLIC_E2E !== '1',
    enablePostHog: analyticsEnabled && process.env.EXPO_PUBLIC_E2E !== '1',
    debug: {
      tracePerformance: true,
    },
  },

  // Performance settings
  performance: {
    maxConcurrentOperations: 5,
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
  },

  // External API endpoints
  api: {
    exchangeRateBaseUrl: 'https://api.exchangerate-api.com/v4/latest',
    // Historical snapshots are published as date-versioned JSON through npm's
    // jsDelivr CDN. The matching Cloudflare host is used as a fallback.
    exchangeRateHistoricalBaseUrl: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@',
    exchangeRateHistoricalFallbackBaseUrl: 'https://',
    exchangeRateHistoricalEarliestDate: '2024-03-02',
    exchangeRateHistoricalFrankfurterEcbUrl: 'https://api.frankfurter.dev/v2/providers/ecb/rate',
    // Set this when the version-policy endpoint is ready. Keeping it empty
    // makes the app-side gate inert until the remote policy is deployed.
    versionPolicyUrl: process.env.EXPO_PUBLIC_VERSION_POLICY_URL ?? '',
  },

  // Public legal and support links
  links: {
    privacyPolicyUrl: 'https://full-frills-landing.vercel.app/privacy.html',
  },

  // Legal document versions used for local acknowledgement records
  legal: {
    privacyPolicyVersion: '2026-10-04',
  },

  // Business Logic Constants
  constants: {
    precision: 2,
    validation: {
      maxAccountNameLength: 100,
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
      icon: Icon.Scale,
      description: 'System account that stores opening balances',
    } satisfies { namePrefix: string; icon: IconName; description: string },
    balanceCorrections: {
      namePrefix: 'Balance Corrections',
      icon: Icon.Wrench,
      description: 'System account that stores balance corrections',
      legacyNames: ['Balance Corrections', 'Balance Correction', 'Balance Corrections ()'],
    } satisfies {
      namePrefix: string;
      icon: IconName;
      description: string;
      legacyNames: readonly string[];
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
    hierarchyModalHeightPercent: '80%',
    toastTopOffset: 60,
  },

  // Default Values
  defaults: {
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
    },
    maxTooltipDetails: 6,
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
    containerHeight: 180,
    labelHeight: 30,
  },
  toast: {
    animationDurationMs: 200,
    enterOffsetY: 20,
  },
  time: {
    msPerDay: 24 * 60 * 60 * 1000,
  },
};
