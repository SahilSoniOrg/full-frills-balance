import { Href, router } from 'expo-router';
import type { TransactionIntentSeed } from '@/src/features/journal/entry/journalEntryRouteAdapter';
import { toLegacyJournalEntryQueryParams } from '@/src/features/journal/entry/journalEntryRouteAdapter';
import { AccountType } from '../types/enums';
import { AccountId, BudgetId, PlannedPaymentId } from '../types/ids';

const JOURNAL_ENTRY_NAVIGATION_DEDUPE_MS = 750;
let lastJournalEntryNavigation: { href: string; timestamp: number } | null = null;

/**
 * Builds a route with query parameters, filtering out null, undefined, and empty string values.
 */
export function buildRoute(
  pathname: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): Href {
  if (!params) return pathname as Href;
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      queryParams.append(key, String(value));
    }
  }
  const query = queryParams.toString();
  return (query ? `${pathname}?${query}` : pathname) as Href;
}

/**
 * Centralized navigation utility to handle routing across the application.
 * Addresses FINDING-004 by removing ad-hoc router.push calls from ViewModels.
 */
export const AppNavigation = {
  /**
   * Navigate back to the previous screen.
   */
  back: () => {
    lastJournalEntryNavigation = null;
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  },

  /**
   * Navigate to the Dashboard (Home tab).
   */
  toDashboard: () => {
    router.replace('/');
  },

  /**
   * Navigate to the Accounts List tab.
   */
  toAccounts: () => {
    router.replace('/(tabs)/accounts');
  },

  /**
   * Navigate to the Activity/Journal List tab.
   */
  toJournal: () => {
    router.replace('/(tabs)/activity');
  },

  /**
   * Navigate to the Commitments/Budget List tab.
   */
  toCommitments: () => {
    router.replace('/(tabs)/commitments');
  },

  /**
   * Navigate to the Settings tab.
   */
  toSettings: () => {
    router.replace('/(tabs)/settings');
  },

  /**
   * Navigate to the Journal Entry screen (Create or Edit).
   */
  toJournalEntry: (options?: {
    /** New typed launch contract. Legacy fields below remain supported. */
    seed?: TransactionIntentSeed;
    journalId?: string;
    smsId?: string;
    smsRecordId?: string;
    smsSender?: string;
    rawSmsBody?: string;
    initialDate?: string;
    sourceAccountId?: string;
    destinationAccountId?: string;
    amount?: string;
    description?: string;
    notes?: string;
    params?: Record<string, string>;
  }) => {
    const { seed, params, ...direct } = options ?? {};
    const href = buildRoute('/journal-entry', {
      ...(seed ? toLegacyJournalEntryQueryParams(seed) : {}),
      ...direct,
      ...params,
    });
    const now = Date.now();
    if (
      lastJournalEntryNavigation &&
      lastJournalEntryNavigation.href === href &&
      now - lastJournalEntryNavigation.timestamp < JOURNAL_ENTRY_NAVIGATION_DEDUPE_MS
    ) {
      return;
    }

    lastJournalEntryNavigation = { href: String(href), timestamp: now };
    router.push(href);
  },

  /** Open Batch inside the shared journal-entry composer. */
  toBulkJournalEntry: () => {
    router.push('/journal-entry?mode=bulk');
  },

  /**
   * Navigate to the journal editor in simple mode with a preselected type.
   */
  toSimpleJournalEntry: (
    type: 'expense' | 'income' | 'transfer',
    options?: {
      sourceAccountId?: string;
      destinationAccountId?: string;
      amount?: string;
      journalId?: string;
    },
  ) => {
    AppNavigation.toJournalEntry({
      journalId: options?.journalId,
      sourceAccountId: options?.sourceAccountId,
      params: {
        mode: 'simple',
        type,
        ...(options?.destinationAccountId
          ? { destinationAccountId: options.destinationAccountId }
          : {}),
        ...(options?.amount ? { amount: options.amount } : {}),
      },
    });
  },

  /**
   * Navigate to the journal editor in advanced mode.
   */
  toAdvancedJournalEntry: (options?: {
    sourceAccountId?: string;
    destinationAccountId?: string;
  }) => {
    AppNavigation.toJournalEntry({
      sourceAccountId: options?.sourceAccountId,
      params: {
        mode: 'advanced',
        ...(options?.destinationAccountId
          ? { destinationAccountId: options.destinationAccountId }
          : {}),
      },
    });
  },

  /**
   * Navigate to the Journal Details screen.
   * Supports optional preview data for immediate rendering while the full record loads.
   */
  toJournalDetails: (
    journalId: string,
    preview?: {
      title?: string;
      amount?: number;
      currencyCode?: string;
      date?: number;
      typeColor?: string;
      typeIcon?: string;
      displayType?: string;
    },
  ) => {
    router.push(
      buildRoute('/journal-details', {
        journalId,
        title: preview?.title,
        amount: preview?.amount,
        currencyCode: preview?.currencyCode,
        date: preview?.date,
        typeColor: preview?.typeColor,
        typeIcon: preview?.typeIcon,
        displayType: preview?.displayType,
      }),
    );
  },

  /**
   * Navigate to the Account Details screen.
   */
  toAccountDetails: (
    accountId: AccountId,
    options?: {
      startDate?: number;
      endDate?: number;
      preview?: {
        name?: string;
        balance?: number;
        currency?: string;
        icon?: string;
        type?: string;
        colorKey?: string;
      };
    },
  ) => {
    router.push(
      buildRoute('/account-details', {
        accountId,
        startDate: options?.startDate,
        endDate: options?.endDate,
        pName: options?.preview?.name,
        pBalance: options?.preview?.balance,
        pCurrency: options?.preview?.currency,
        pIcon: options?.preview?.icon,
        pType: options?.preview?.type,
        pColor: options?.preview?.colorKey,
      }),
    );
  },

  /**
   * Navigate to the Account Details screen, replacing the current route.
   */
  replaceToAccountDetails: (accountId: AccountId) => {
    router.replace(buildRoute('/account-details', { accountId }));
  },

  /**
   * Navigate to the Account Form screen (Create or Edit).
   */
  toAccountForm: (
    accountId?: string,
    preview?: {
      name?: string;
      type?: string;
      currency?: string;
      icon?: string;
    },
  ) => {
    router.push(
      buildRoute('/account-creation', {
        accountId,
        pName: preview?.name,
        pType: preview?.type,
        pCurrency: preview?.currency,
        pIcon: preview?.icon,
      }),
    );
  },

  /**
   * Navigate to account creation route with optional preselected type.
   */
  toAccountCreation: (type?: AccountType | string) => {
    router.push(buildRoute('/account-creation', { type }));
  },

  /**
   * Navigate to the Category Form screen (Create or Edit).
   */
  toCategoryForm: (
    accountId?: string,
    preview?: {
      name?: string;
      type?: string;
      currency?: string;
      icon?: string;
    },
  ) => {
    router.push(
      buildRoute('/category-creation', {
        accountId,
        pName: preview?.name,
        pType: preview?.type,
        pCurrency: preview?.currency,
        pIcon: preview?.icon,
      }),
    );
  },

  /**
   * Navigate to category creation route with optional preselected type.
   */
  toCategoryCreation: (type?: AccountType | string) => {
    router.push(buildRoute('/category-creation', { type }));
  },

  /**
   * Navigate to the Budget Detail screen.
   */
  toBudgetDetail: (
    budgetId: BudgetId,
    preview?: {
      name?: string;
      amount?: number;
      currency?: string;
      period?: string;
    },
  ) => {
    router.push(
      buildRoute('/budget-details', {
        id: budgetId,
        pName: preview?.name,
        pAmount: preview?.amount,
        pCurrency: preview?.currency,
        pPeriod: preview?.period,
      }),
    );
  },

  /**
   * Navigate to the Budget Form screen (Create or Edit).
   */
  toBudgetForm: (
    budgetId?: BudgetId,
    preview?: {
      name?: string;
      amount?: number;
      currency?: string;
    },
  ) => {
    router.push(
      buildRoute('/budget-edit', {
        id: budgetId,
        pName: preview?.name,
        pAmount: preview?.amount,
        pCurrency: preview?.currency,
      }),
    );
  },

  /**
   * Navigate to appearance settings.
   */
  toAppearanceSettings: () => {
    router.push('/appearance-settings' as Href);
  },

  /**
   * Navigate to personalization settings.
   */
  toPersonalizationSettings: () => {
    router.push('/personalization-settings' as Href);
  },

  /**
   * Navigate to data management settings.
   */
  toDataManagementSettings: () => {
    router.push('/data-management-settings' as Href);
  },

  /**
   * Navigate to privacy and security settings.
   */
  toPrivacySecuritySettings: () => {
    router.push('/privacy-security-settings' as Href);
  },

  /**
   * Navigate to reminders and automation settings.
   */
  toAutomationSettings: () => {
    router.push('/automation-settings' as Href);
  },

  /**
   * Navigate to maintenance and reset settings.
   */
  toMaintenanceSettings: () => {
    router.push('/maintenance-settings' as Href);
  },

  /**
   * Navigate to about and support settings.
   */
  toAboutSupportSettings: () => {
    router.push('/about-support-settings' as Href);
  },

  /**
   * Navigate to workplace settings.
   */
  toWorkplaceSettings: () => {
    router.push('/workplace-settings' as Href);
  },

  /**
   * Navigate to the Audit Log screen.
   */
  toAuditLog: (options?: { entityType?: string; entityId?: string }) => {
    router.push(
      buildRoute('/audit-log', {
        entityType: options?.entityType,
        entityId: options?.entityId,
      }),
    );
  },

  /**
   * Navigate to the merged account management screen.
   */
  toAccountManagement: (options?: {
    accountId?: string;
    filterMode?: 'accounts' | 'categories';
  }) => {
    router.push(
      buildRoute('/account-management', {
        accountId: options?.accountId,
        filterMode: options?.filterMode,
      }),
    );
  },

  /**
   * Navigate to the Planned Payment Details screen.
   */
  toPlannedPaymentDetails: (
    id: PlannedPaymentId,
    preview?: {
      description?: string;
      amount?: number;
      currency?: string;
      nextDate?: number;
    },
  ) => {
    router.push(
      buildRoute('/planned-payment-details', {
        id,
        pDesc: preview?.description,
        pAmount: preview?.amount,
        pCurrency: preview?.currency,
        pDate: preview?.nextDate,
      }),
    );
  },

  /**
   * Navigate to the Planned Payment Form screen.
   */
  toPlannedPaymentForm: (
    id?: string,
    preview?: {
      description?: string;
      amount?: number;
      currency?: string;
    },
  ) => {
    router.push(
      buildRoute('/planned-payment-form', {
        id,
        pDesc: preview?.description,
        pAmount: preview?.amount,
        pCurrency: preview?.currency,
      }),
    );
  },

  /**
   * Navigate to import selection screen.
   */
  toImportSelection: () => {
    router.push('/import-selection' as Href);
  },

  /**
   * Navigate to SMS rules list.
   */
  toSmsRules: () => {
    router.push('/sms-rules' as Href);
  },

  /**
   * Navigate to the unified Transaction Inbox.
   */
  toTransactionInbox: () => {
    router.push('/sms-inbox' as Href);
  },

  /**
   * Navigate to SMS rule form (new or edit).
   */
  toSmsRuleForm: (
    id?: string,
    seed?: {
      senderMatch?: string;
      bodyMatch?: string;
      sourceAccountId?: string;
      categoryAccountId?: string;
    },
  ) => {
    router.push(
      buildRoute('/sms-rule-form', {
        id,
        senderMatch: seed?.senderMatch,
        bodyMatch: seed?.bodyMatch,
        sourceAccountId: seed?.sourceAccountId,
        categoryAccountId: seed?.categoryAccountId,
      }),
    );
  },

  /**
   * Navigate to the Hub (Notifications & Insights).
   */
  toHub: () => {
    router.push('/hub' as Href);
  },

  /**
   * Navigate to journal entry from a widget or other external launcher.
   */
  toWidgetJournalEntry: (options?: {
    mode?: 'simple' | 'advanced';
    type?: 'income' | 'expense' | 'transfer';
    sourceAccountId?: string;
    destinationAccountId?: string;
  }) => {
    AppNavigation.toJournalEntry({
      params: {
        source: 'widget',
        ...(options?.mode ? { mode: options.mode } : {}),
        ...(options?.type ? { type: options.type } : {}),
        ...(options?.sourceAccountId ? { sourceAccountId: options.sourceAccountId } : {}),
        ...(options?.destinationAccountId
          ? { destinationAccountId: options.destinationAccountId }
          : {}),
      },
    });
  },

  /**
   * Navigate to insight details with route params.
   */
  toInsightDetails: (params: {
    id: string;
    message: string;
    description: string;
    suggestion: string;
    journalIds: string[];
    severity: string;
    amount?: number;
    currencyCode?: string;
  }) => {
    router.push(
      buildRoute('/insight-details', {
        id: params.id,
        message: params.message,
        description: params.description,
        suggestion: params.suggestion,
        journalIds: params.journalIds.join(','),
        severity: params.severity,
        amount: params.amount,
        currencyCode: params.currencyCode,
      }),
    );
  },

  /**
   * Navigate to the Reports screen.
   */
  toReports: () => {
    router.push('/reports' as Href);
  },

  /**
   * Navigate to the Journal Search/Filter screen.
   */
  toJournalSearch: (params?: {
    searchQuery?: string;
    startDate?: number;
    endDate?: number;
    accountIds?: string[];
    minAmount?: number;
    maxAmount?: number;
    displayType?: string;
  }) => {
    router.push(
      buildRoute('/journal-search', {
        q: params?.searchQuery,
        startDate: params?.startDate,
        endDate: params?.endDate,
        accountIds: params?.accountIds?.length ? params.accountIds.join(',') : undefined,
        minAmount: params?.minAmount,
        maxAmount: params?.maxAmount,
        displayType: params?.displayType,
      }),
    );
  },

  /**
   * Navigate to the Design Preview screen.
   */
  toDesignPreview: () => {
    router.push('/_design-preview' as Href);
  },

  /**
   * Navigate to a custom route.
   */
  navigate: (route: string) => {
    router.push(route as Href);
  },

  /**
   * Dismiss current modal or navigate back.
   */
  dismiss: () => {
    if (router.canGoBack()) {
      router.dismiss();
    } else {
      router.replace('/');
    }
  },
};
