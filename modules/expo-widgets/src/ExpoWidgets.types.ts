export type WidgetActionType = 'income' | 'expense' | 'transfer';

export type SafeToSpendSnapshot = {
  amount: number;
  currencyCode: string;
  formattedAmount: string;
  title: string;
  subtitle: string;
  updatedAt: number;
};

export type WidgetThemeSnapshot = {
  themeId: string;
  themeMode: 'light' | 'dark';
  backgroundStartColor: string;
  backgroundEndColor: string;
  titleColor: string;
  primaryTextColor: string;
  secondaryTextColor: string;
  actionIconColor: string;
  incomeAccentColor: string;
  expenseAccentColor: string;
  transferAccentColor: string;
};

export type WidgetDataSnapshot = {
  safeToSpend?: SafeToSpendSnapshot;
  theme?: WidgetThemeSnapshot;
  isPrivacyEnabled?: boolean;
  streak?: {
    count: number;
    todayLogged: boolean;
    lastLoggedDate: string | null;
    canRecover: boolean;
    missedDays: number;
  };
  pendingSms?: {
    id: string;
    merchant: string;
    amount: number;
    currency: string;
  }[];
  pet?: {
    health: number;
    mood: string;
    level?: number;
  };
};

export type PendingSmsRecord = {
  id: string;
  merchant: string;
  amount: string;
  currency?: string;
  sender?: string;
  date?: number;
  processingStatus?: 'pending' | 'imported' | 'dismissed' | 'auto_posted' | string;
};
