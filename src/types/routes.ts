/**
 * Route types for Expo Router navigation
 * Provides type safety for all navigation calls
 */

export type RootStackParamList = {
  index: undefined;
  accounts: undefined;
  'journal-entry': {
    mode?: 'simple' | 'advanced';
    type?: 'income' | 'expense' | 'transfer';
    source?: 'widget';
    sourceAccountId?: string;
    destinationAccountId?: string;
  };
  'journal-list': undefined;
  'transaction-details': { journalId: string };
  'account-creation': undefined;
  onboarding: undefined;
  '_design-preview': undefined;
  modal: undefined;
  'import-selection': undefined;
};

export type Routes = keyof RootStackParamList;
