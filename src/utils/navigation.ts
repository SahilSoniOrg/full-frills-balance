import { Href, router } from 'expo-router';
import { AccountId, BudgetId, PlannedPaymentId } from '../types/domain';

/**
 * Centralized navigation utility to handle routing across the application.
 * Addresses FINDING-004 by removing ad-hoc router.push calls from ViewModels.
 */
export const AppNavigation = {
  /**
   * Navigate back to the previous screen.
   */
  back: () => {
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
    journalId?: string;
    smsId?: string;
    smsRecordId?: string;
    smsSender?: string;
    rawSmsBody?: string;
    initialDate?: string;
    sourceAccountId?: string;
    params?: Record<string, string>;
  }) => {
    const queryParams = new URLSearchParams();
    if (options?.journalId) {
      queryParams.append('journalId', options.journalId);
    }
    if (options?.smsId) {
      queryParams.append('smsId', options.smsId);
    }
    if (options?.smsRecordId) {
      queryParams.append('smsRecordId', options.smsRecordId);
    }
    if (options?.smsSender) {
      queryParams.append('smsSender', options.smsSender);
    }
    if (options?.rawSmsBody) {
      queryParams.append('rawSmsBody', options.rawSmsBody);
    }
    if (options?.initialDate) {
      queryParams.append('initialDate', options.initialDate);
    }
    if (options?.sourceAccountId) {
      queryParams.append('sourceAccountId', options.sourceAccountId);
    }
    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        queryParams.append(key, value);
      });
    }

    const queryString = queryParams.toString();
    const route = queryString ? `/journal-entry?${queryString}` : '/journal-entry';

    router.push(route as Href);
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
    const params: Record<string, string> = {
      mode: 'simple',
      type,
    };

    if (options?.destinationAccountId) {
      params.destinationAccountId = options.destinationAccountId;
    }
    if (options?.amount) {
      params.amount = options.amount;
    }

    AppNavigation.toJournalEntry({
      journalId: options?.journalId,
      sourceAccountId: options?.sourceAccountId,
      params,
    });
  },

  /**
   * Navigate to the journal editor in advanced mode.
   */
  toAdvancedJournalEntry: (options?: {
    sourceAccountId?: string;
    destinationAccountId?: string;
  }) => {
    const params: Record<string, string> = {
      mode: 'advanced',
    };

    if (options?.destinationAccountId) {
      params.destinationAccountId = options.destinationAccountId;
    }

    AppNavigation.toJournalEntry({
      sourceAccountId: options?.sourceAccountId,
      params,
    });
  },

  /**
   * Navigate to the Journal list filtered by a date range.
   */
  toJournalWithDateRange: (startDate: number, endDate: number) => {
    router.push({
      pathname: '/journal',
      params: {
        startDate: startDate.toString(),
        endDate: endDate.toString(),
      },
    } as Href);
  },

  /**
   * Navigate to the Transaction Details screen.
   * Supports optional preview data for immediate rendering while the full record loads.
   */
  toTransactionDetails: (
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
    const queryParams = new URLSearchParams();
    queryParams.append('journalId', journalId);

    if (preview) {
      if (preview.title) queryParams.append('title', preview.title);
      if (preview.amount !== undefined) queryParams.append('amount', String(preview.amount));
      if (preview.currencyCode) queryParams.append('currencyCode', preview.currencyCode);
      if (preview.date) queryParams.append('date', String(preview.date));
      if (preview.typeColor) queryParams.append('typeColor', preview.typeColor);
      if (preview.typeIcon) queryParams.append('typeIcon', preview.typeIcon);
      if (preview.displayType) queryParams.append('displayType', preview.displayType);
    }

    router.push(`/transaction-details?${queryParams.toString()}` as Href);
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
    const params: Record<string, string> = { accountId };
    if (typeof options?.startDate === 'number') {
      params.startDate = options.startDate.toString();
    }
    if (typeof options?.endDate === 'number') {
      params.endDate = options.endDate.toString();
    }
    if (options?.preview) {
      if (options.preview.name) params.pName = options.preview.name;
      if (options.preview.balance !== undefined) params.pBalance = String(options.preview.balance);
      if (options.preview.currency) params.pCurrency = options.preview.currency;
      if (options.preview.icon) params.pIcon = options.preview.icon;
      if (options.preview.type) params.pType = options.preview.type;
      if (options.preview.colorKey) params.pColor = options.preview.colorKey;
    }

    router.push({
      pathname: '/account-details',
      params,
    } as Href);
  },

  /**
   * Navigate to the Account Details screen, replacing the current route.
   */
  replaceToAccountDetails: (accountId: AccountId) => {
    router.replace(`/account-details?accountId=${accountId}` as Href);
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
    const queryParams = new URLSearchParams();
    if (accountId) queryParams.append('accountId', accountId);
    if (preview) {
      if (preview.name) queryParams.append('pName', preview.name);
      if (preview.type) queryParams.append('pType', preview.type);
      if (preview.currency) queryParams.append('pCurrency', preview.currency);
      if (preview.icon) queryParams.append('pIcon', preview.icon);
    }
    const queryString = queryParams.toString();
    router.push((queryString ? `/account-creation?${queryString}` : '/account-creation') as Href);
  },

  /**
   * Navigate to account creation route with optional preselected type.
   */
  toAccountCreation: (type?: string) => {
    if (type) {
      router.push(`/account-creation?type=${type}` as Href);
    } else {
      router.push('/account-creation' as Href);
    }
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
    const queryParams = new URLSearchParams();
    if (accountId) queryParams.append('accountId', accountId);
    if (preview) {
      if (preview.name) queryParams.append('pName', preview.name);
      if (preview.type) queryParams.append('pType', preview.type);
      if (preview.currency) queryParams.append('pCurrency', preview.currency);
      if (preview.icon) queryParams.append('pIcon', preview.icon);
    }
    const queryString = queryParams.toString();
    router.push((queryString ? `/category-creation?${queryString}` : '/category-creation') as Href);
  },

  /**
   * Navigate to category creation route with optional preselected type.
   */
  toCategoryCreation: (type?: string) => {
    if (type) {
      router.push(`/category-creation?type=${type}` as Href);
    } else {
      router.push('/category-creation' as Href);
    }
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
    const queryParams = new URLSearchParams();
    queryParams.append('id', budgetId);
    if (preview) {
      if (preview.name) queryParams.append('pName', preview.name);
      if (preview.amount !== undefined) queryParams.append('pAmount', String(preview.amount));
      if (preview.currency) queryParams.append('pCurrency', preview.currency);
      if (preview.period) queryParams.append('pPeriod', preview.period);
    }
    router.push(`/budget-details?${queryParams.toString()}` as Href);
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
    const queryParams = new URLSearchParams();
    if (budgetId) queryParams.append('id', budgetId);
    if (preview) {
      if (preview.name) queryParams.append('pName', preview.name);
      if (preview.amount !== undefined) queryParams.append('pAmount', String(preview.amount));
      if (preview.currency) queryParams.append('pCurrency', preview.currency);
    }
    const queryString = queryParams.toString();
    router.push((queryString ? `/budget-edit?${queryString}` : '/budget-edit') as Href);
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
    const queryParams = new URLSearchParams();
    if (options?.entityType) queryParams.append('entityType', options.entityType);
    if (options?.entityId) queryParams.append('entityId', options.entityId);
    const queryString = queryParams.toString();
    const route = queryString ? `/audit-log?${queryString}` : '/audit-log';
    router.push(route as Href);
  },

  /**
   * Navigate to the Account Reorder screen.
   */
  toAccountReorder: (filterMode?: 'accounts' | 'categories') => {
    if (filterMode) {
      router.push(`/account-reorder?filterMode=${filterMode}` as Href);
    } else {
      router.push('/account-reorder' as Href);
    }
  },

  /**
   * Navigate to the Manage Hierarchy screen.
   */
  toManageHierarchy: (options?: { accountId?: string; filterMode?: 'accounts' | 'categories' }) => {
    const queryParams = new URLSearchParams();
    if (options?.accountId) queryParams.append('accountId', options.accountId);
    if (options?.filterMode) queryParams.append('filterMode', options.filterMode);
    const queryString = queryParams.toString();
    const route = queryString ? `/manage-hierarchy?${queryString}` : '/manage-hierarchy';
    router.push(route as Href);
  },

  /**
   * Navigate to the Planned Payments List screen.
   */
  toPlannedPayments: () => {
    router.push('/planned-payments' as Href);
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
    const queryParams = new URLSearchParams();
    queryParams.append('id', id);
    if (preview) {
      if (preview.description) queryParams.append('pDesc', preview.description);
      if (preview.amount !== undefined) queryParams.append('pAmount', String(preview.amount));
      if (preview.currency) queryParams.append('pCurrency', preview.currency);
      if (preview.nextDate) queryParams.append('pDate', String(preview.nextDate));
    }
    router.push(`/planned-payment-details?${queryParams.toString()}` as Href);
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
    const queryParams = new URLSearchParams();
    if (id) queryParams.append('id', id);
    if (preview) {
      if (preview.description) queryParams.append('pDesc', preview.description);
      if (preview.amount !== undefined) queryParams.append('pAmount', String(preview.amount));
      if (preview.currency) queryParams.append('pCurrency', preview.currency);
    }
    const queryString = queryParams.toString();
    router.push(
      (queryString ? `/planned-payment-form?${queryString}` : '/planned-payment-form') as Href,
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
    const seedParams = new URLSearchParams();
    if (seed?.senderMatch) seedParams.append('senderMatch', seed.senderMatch);
    if (seed?.bodyMatch) seedParams.append('bodyMatch', seed.bodyMatch);
    if (seed?.sourceAccountId) seedParams.append('sourceAccountId', seed.sourceAccountId);
    if (seed?.categoryAccountId) seedParams.append('categoryAccountId', seed.categoryAccountId);
    const seedQuery = seedParams.toString();
    if (id) {
      router.push(`/sms-rule-form?id=${id}` as Href);
    } else {
      router.push((seedQuery ? `/sms-rule-form?${seedQuery}` : '/sms-rule-form') as Href);
    }
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
    const params: Record<string, string> = {
      source: 'widget',
    };

    if (options?.mode) {
      params.mode = options.mode;
    }
    if (options?.type) {
      params.type = options.type;
    }
    if (options?.sourceAccountId) {
      params.sourceAccountId = options.sourceAccountId;
    }
    if (options?.destinationAccountId) {
      params.destinationAccountId = options.destinationAccountId;
    }

    AppNavigation.toJournalEntry({ params });
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
    router.push({
      pathname: '/insight-details',
      params: {
        id: params.id,
        message: params.message,
        description: params.description,
        suggestion: params.suggestion,
        journalIds: params.journalIds.join(','),
        severity: params.severity,
        amount: typeof params.amount === 'number' ? String(params.amount) : undefined,
        currencyCode: params.currencyCode,
      },
    } as Href);
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
    const queryParams = new URLSearchParams();
    if (params?.searchQuery) queryParams.append('q', params.searchQuery);
    if (params?.startDate) queryParams.append('startDate', String(params.startDate));
    if (params?.endDate) queryParams.append('endDate', String(params.endDate));
    if (params?.accountIds?.length) queryParams.append('accountIds', params.accountIds.join(','));
    if (params?.minAmount !== undefined) queryParams.append('minAmount', String(params.minAmount));
    if (params?.maxAmount !== undefined) queryParams.append('maxAmount', String(params.maxAmount));
    if (params?.displayType) queryParams.append('displayType', params.displayType);

    const queryString = queryParams.toString();
    router.push((queryString ? `/journal-search?${queryString}` : '/journal-search') as Href);
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
   * Navigate to the AI Benchmark screen.
   */
  toAiBenchmark: () => {
    router.push('/ai-benchmark' as Href);
  },

  /**
   * Navigate to the AI Example replica screen (raw litert-lm test).
   */
  toAiExample: () => {
    router.push('/ai-example' as Href);
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
