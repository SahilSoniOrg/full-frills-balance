import { router } from 'expo-router';

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
    toJournalEntry: (options?: { journalId?: string; smsId?: string; smsRecordId?: string; smsSender?: string; rawSmsBody?: string; initialDate?: string; sourceAccountId?: string; params?: Record<string, string> }) => {
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

        router.push(route as any);
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
        } as any);
    },

    /**
     * Navigate to the Transaction Details screen.
     * Supports optional preview data for immediate rendering while the full record loads.
     */
    toTransactionDetails: (journalId: string, preview?: { 
        title?: string; 
        amount?: number; 
        currencyCode?: string; 
        date?: number; 
        typeColor?: string; 
        typeIcon?: string;
        displayType?: string;
    }) => {
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

        router.push(`/transaction-details?${queryParams.toString()}` as any);
    },

    /**
     * Navigate to the Account Details screen.
     */
    toAccountDetails: (accountId: string, options?: { 
        startDate?: number; 
        endDate?: number;
        preview?: {
            name?: string;
            balance?: number;
            currency?: string;
            icon?: string;
            type?: string;
            colorKey?: string;
        }
    }) => {
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
        } as any);
    },

    /**
     * Navigate to the Account Details screen, replacing the current route.
     */
    replaceToAccountDetails: (accountId: string) => {
        router.replace(`/account-details?accountId=${accountId}` as any);
    },

    /**
     * Navigate to the Account Form screen (Create or Edit).
     */
    toAccountForm: (accountId?: string, preview?: {
        name?: string;
        type?: string;
        currency?: string;
        icon?: string;
    }) => {
        const queryParams = new URLSearchParams();
        if (accountId) queryParams.append('accountId', accountId);
        if (preview) {
            if (preview.name) queryParams.append('pName', preview.name);
            if (preview.type) queryParams.append('pType', preview.type);
            if (preview.currency) queryParams.append('pCurrency', preview.currency);
            if (preview.icon) queryParams.append('pIcon', preview.icon);
        }
        const queryString = queryParams.toString();
        router.push((queryString ? `/account-creation?${queryString}` : '/account-creation') as any);
    },

    /**
     * Navigate to account creation route with optional preselected type.
     */
    toAccountCreation: (type?: string) => {
        if (type) {
            router.push(`/account-creation?type=${type}` as any);
        } else {
            router.push('/account-creation' as any);
        }
    },

    /**
     * Navigate to the Budget Detail screen.
     */
    toBudgetDetail: (budgetId: string, preview?: {
        name?: string;
        amount?: number;
        currency?: string;
        period?: string;
    }) => {
        const queryParams = new URLSearchParams();
        queryParams.append('id', budgetId);
        if (preview) {
            if (preview.name) queryParams.append('pName', preview.name);
            if (preview.amount !== undefined) queryParams.append('pAmount', String(preview.amount));
            if (preview.currency) queryParams.append('pCurrency', preview.currency);
            if (preview.period) queryParams.append('pPeriod', preview.period);
        }
        router.push(`/budget-details?${queryParams.toString()}`);
    },

    /**
     * Navigate to the Budget Form screen (Create or Edit).
     */
    toBudgetForm: (budgetId?: string, preview?: {
        name?: string;
        amount?: number;
        currency?: string;
    }) => {
        const queryParams = new URLSearchParams();
        if (budgetId) queryParams.append('id', budgetId);
        if (preview) {
            if (preview.name) queryParams.append('pName', preview.name);
            if (preview.amount !== undefined) queryParams.append('pAmount', String(preview.amount));
            if (preview.currency) queryParams.append('pCurrency', preview.currency);
        }
        const queryString = queryParams.toString();
        router.push((queryString ? `/budget-edit?${queryString}` : '/budget-edit') as any);
    },

    /**
     * Navigate to appearance settings.
     */
    toAppearanceSettings: () => {
        router.push('/appearance-settings' as any);
    },

    /**
     * Navigate to personalization settings.
     */
    toPersonalizationSettings: () => {
        router.push('/personalization-settings' as any);
    },

    /**
     * Navigate to data management settings.
     */
    toDataManagementSettings: () => {
        router.push('/data-management-settings' as any);
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
        router.push(route as any);
    },

    /**
     * Navigate to the Account Reorder screen.
     */
    toAccountReorder: () => {
        router.push('/account-reorder' as any);
    },

    /**
     * Navigate to the Manage Hierarchy screen.
     */
    toManageHierarchy: (options?: { accountId?: string }) => {
        if (options?.accountId) {
            router.push(`/manage-hierarchy?accountId=${options.accountId}` as any);
        } else {
            router.push('/manage-hierarchy' as any);
        }
    },

    /**
     * Navigate to the Planned Payments List screen.
     */
    toPlannedPayments: () => {
        router.push('/planned-payments' as any);
    },

    /**
     * Navigate to the Planned Payment Details screen.
     */
    toPlannedPaymentDetails: (id: string, preview?: {
        description?: string;
        amount?: number;
        currency?: string;
        nextDate?: number;
    }) => {
        const queryParams = new URLSearchParams();
        queryParams.append('id', id);
        if (preview) {
            if (preview.description) queryParams.append('pDesc', preview.description);
            if (preview.amount !== undefined) queryParams.append('pAmount', String(preview.amount));
            if (preview.currency) queryParams.append('pCurrency', preview.currency);
            if (preview.nextDate) queryParams.append('pDate', String(preview.nextDate));
        }
        router.push(`/planned-payment-details?${queryParams.toString()}` as any);
    },

    /**
     * Navigate to the Planned Payment Form screen.
     */
    toPlannedPaymentForm: (id?: string, preview?: {
        description?: string;
        amount?: number;
        currency?: string;
    }) => {
        const queryParams = new URLSearchParams();
        if (id) queryParams.append('id', id);
        if (preview) {
            if (preview.description) queryParams.append('pDesc', preview.description);
            if (preview.amount !== undefined) queryParams.append('pAmount', String(preview.amount));
            if (preview.currency) queryParams.append('pCurrency', preview.currency);
        }
        const queryString = queryParams.toString();
        router.push((queryString ? `/planned-payment-form?${queryString}` : '/planned-payment-form') as any);
    },

    /**
     * Navigate to import selection screen.
     */
    toImportSelection: () => {
        router.push('/import-selection' as any);
    },

    /**
     * Navigate to SMS rules list.
     */
    toSmsRules: () => {
        router.push('/sms-rules' as any);
    },

    /**
     * Navigate to SMS inbox.
     */
    toSmsInbox: () => {
        router.push('/sms-inbox' as any);
    },

    /**
     * Navigate to SMS rule form (new or edit).
     */
    toSmsRuleForm: (id?: string, seed?: {
        senderMatch?: string;
        bodyMatch?: string;
        sourceAccountId?: string;
        categoryAccountId?: string;
    }) => {
        const seedParams = new URLSearchParams();
        if (seed?.senderMatch) seedParams.append('senderMatch', seed.senderMatch);
        if (seed?.bodyMatch) seedParams.append('bodyMatch', seed.bodyMatch);
        if (seed?.sourceAccountId) seedParams.append('sourceAccountId', seed.sourceAccountId);
        if (seed?.categoryAccountId) seedParams.append('categoryAccountId', seed.categoryAccountId);
        const seedQuery = seedParams.toString();
        if (id) {
            router.push(`/sms-rule-form?id=${id}` as any);
        } else {
            router.push((seedQuery ? `/sms-rule-form?${seedQuery}` : '/sms-rule-form') as any);
        }
    },

    /**
     * Navigate to insights list.
     */
    toInsights: () => {
        router.push('/insights' as any);
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
        } as any);
    },

    /**
     * Navigate to the Reports screen.
     */
    toReports: () => {
        router.push('/reports' as any);
    },

    /**
     * Navigate to the Design Preview screen.
     */
    toDesignPreview: () => {
        router.push('/_design-preview' as any);
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
    }
};
