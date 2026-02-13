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
    toJournalEntry: (journalId?: string) => {
        if (journalId) {
            router.push(`/journal-entry?journalId=${journalId}` as any);
        } else {
            router.push('/journal-entry' as any);
        }
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
    toAccountDetails: (accountId: string) => {
        router.push(`/accounts/${accountId}` as any);
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
     * Navigate to the Audit Log screen.
     */
    toAuditLog: () => {
        router.push('/audit/log' as any);
    },

    /**
     * Navigate to the Account Reorder screen.
     */
    toAccountReorder: () => {
        router.push('/accounts/reorder' as any);
    }
};
