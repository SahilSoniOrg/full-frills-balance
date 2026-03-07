import { router } from 'expo-router';

/**
 * Centralized navigation utility to handle routing across the application.
 * Addresses FINDING-004 by removing ad-hoc router.push calls from ViewModels.
 */
export const AppNavigation = {
    /**
     * Navigate back to the previous screen.
     */
    back: () => router.back(),

    /**
     * Navigate to the Journal Entry screen (Create or Edit).
     */
    toJournalEntry: (options?: { journalId?: string; smsId?: string; smsSender?: string; rawSmsBody?: string; initialDate?: string; params?: Record<string, string> }) => {
        const queryParams = new URLSearchParams();
        if (options?.journalId) {
            queryParams.append('journalId', options.journalId);
        }
        if (options?.smsId) {
            queryParams.append('smsId', options.smsId);
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
     */
    toTransactionDetails: (journalId: string) => {
        router.push(`/transaction-details?journalId=${journalId}` as any);
    },

    /**
     * Navigate to the Account Details screen.
     */
    toAccountDetails: (accountId: string, options?: { startDate?: number; endDate?: number }) => {
        const params: Record<string, string> = { accountId };
        if (typeof options?.startDate === 'number') {
            params.startDate = options.startDate.toString();
        }
        if (typeof options?.endDate === 'number') {
            params.endDate = options.endDate.toString();
        }

        router.push({
            pathname: '/account-details',
            params,
        } as any);
    },

    /**
     * Navigate to the Account Form screen (Create or Edit).
     */
    toAccountForm: (accountId?: string) => {
        if (accountId) {
            router.push(`/accounts/form?id=${accountId}` as any);
        } else {
            router.push('/accounts/form' as any);
        }
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
    toBudgetDetail: (budgetId: string) => {
        router.push(`/budget-details?id=${budgetId}`);
    },

    /**
     * Navigate to the Budget Form screen (Create or Edit).
     */
    toBudgetForm: (budgetId?: string) => {
        if (budgetId) {
            router.push(`/budget-edit?id=${budgetId}`);
        } else {
            router.push('/budget-edit');
        }
    },

    /**
     * Navigate to the Reports screen.
     */
    toReports: () => {
        router.push('/reports' as any);
    },

    /**
     * Navigate to the Settings screen.
     */
    toSettings: () => {
        router.push('/settings' as any);
    },

    /**
     * Navigate to appearance settings.
     */
    toAppearanceSettings: () => {
        router.push('/appearance-settings' as any);
    },

    /**
     * Navigate to the Audit Log screen.
     */
    toAuditLog: () => {
        router.push('/audit-log' as any);
    },

    /**
     * Navigate to the Account Reorder screen.
     */
    toAccountReorder: () => {
        router.push('/accounts/reorder' as any);
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
    toPlannedPaymentDetails: (id: string) => {
        router.push(`/planned-payment-details?id=${id}` as any);
    },

    /**
     * Navigate to the Planned Payment Form screen.
     */
    toPlannedPaymentForm: (id?: string) => {
        if (id) {
            router.push(`/planned-payment-form?id=${id}` as any);
        } else {
            router.push('/planned-payment-form' as any);
        }
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
     * Navigate to SMS rule form (new or edit).
     */
    toSmsRuleForm: (id?: string) => {
        if (id) {
            router.push(`/sms-rule-form?id=${id}` as any);
        } else {
            router.push('/sms-rule-form' as any);
        }
    },

    /**
     * Navigate to insights list.
     */
    toInsights: () => {
        router.push('/insights' as any);
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
    }
};
