export type WidgetActionType = 'income' | 'expense' | 'transfer';

export type SafeToSpendSnapshot = {
  amount: number;
  currencyCode: string;
  formattedAmount: string;
  title: string;
  subtitle: string;
  updatedAt: number;
  /** Forecast acquisition basis; native widget templates currently display updatedAt only. */
  asOf?: number;
  horizonDays?: number;
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
};
