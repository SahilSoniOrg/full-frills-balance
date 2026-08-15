import { IconName } from '@/src/components/core';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account, { formatAccountSubtypeLabel, isAccountType } from '@/src/data/models/Account';
import { useAccountDashboard } from '@/src/features/accounts/hooks/useAccountDashboard';
import { getAccountFallbackIcon } from '@/src/utils/accountIcon';
import { useDateRangeFilter } from '@/src/hooks/useDateRangeFilter';
import { useObservable } from '@/src/hooks/useObservable';
import { observeUnreconciledMetrics } from '@/src/services/accounts/accountDerivedReads';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import {
  AccountBalance,
  AccountId,
  PlainAccount,
  WorkplaceId,
  AccountType,
} from '@/src/types/domain';
import { getAccountTypeColorKey, getAccountTypeVariant } from '@/src/utils/accountCategory';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { ComponentVariant } from '@/src/utils/style-helpers';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { of } from 'rxjs';

export interface AccountDetailsData {
  accountId: AccountId;
  workplaceId: WorkplaceId;
  workplaceCurrency: string;
  account: Account | PlainAccount | null;
  balanceData: AccountBalance | null;
  accounts: (Account | PlainAccount)[];
  rawSubBalances: AccountBalance[];
  dashboardLoading: boolean;
  accountLoading: boolean;
  accountMissing: boolean;
  accountName: string;
  accountType: AccountType;
  accountSubtypeLabel: string;
  accountTypeVariant: ComponentVariant;
  accountIcon: IconName | null;
  accountTypeColorKey: string;
  /** Custom per-account color (hex, '' = auto/derive from type). */
  accountColor: string;
  isDeleted: boolean;
  isArchived: boolean;
  balanceCurrency: string;
  /** Raw balance for MoneyText; null while account not yet resolved. */
  balanceAmount: number | null;
  transactionCount: number;
  transactionCountText: string;
  reconciledAtMs: number | null;
  dateRange: DateRange | null;
  periodFilter: PeriodFilter;
  isDatePickerVisible: boolean;
  showDatePicker: () => void;
  hideDatePicker: () => void;
  navigatePrevious?: () => void;
  navigateNext?: () => void;
  onDateSelect: (range: DateRange | null, filter: PeriodFilter) => void;
  unreconciledCount: number;
  unreconciledAmount: number;
}

export function useAccountDetailsData(): AccountDetailsData {
  const { workplaceId, defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const params = useLocalSearchParams<{
    accountId: AccountId;
    pName?: string;
    pBalance?: string;
    pCurrency?: string;
    pIcon?: string;
    pType?: string;
    pColor?: string;
    startDate?: string;
    endDate?: string;
  }>();
  const accountId = params.accountId;
  const startDateParam = params.startDate;
  const endDateParam = params.endDate;

  const initialDateRange = useMemo(() => {
    if (startDateParam && endDateParam) {
      const parsedStartDate = Number.parseInt(startDateParam, 10);
      const parsedEndDate = Number.parseInt(endDateParam, 10);
      if (!Number.isFinite(parsedStartDate) || !Number.isFinite(parsedEndDate)) {
        return null;
      }
      return { startDate: parsedStartDate, endDate: parsedEndDate };
    }
    return null;
  }, [startDateParam, endDateParam]);

  const {
    dateRange,
    periodFilter,
    isPickerVisible: isDatePickerVisible,
    showPicker: showDatePicker,
    hidePicker,
    setFilter,
    navigatePrevious,
    navigateNext,
  } = useDateRangeFilter({
    defaultToCurrentMonth: !initialDateRange,
    initialDateRange,
  });

  const {
    account: dbAccount,
    balanceData: dbBalanceData,
    subAccounts: rawSubBalances,
    allAccounts: accounts,
    isLoading: dashboardLoading,
  } = useAccountDashboard(workplaceId, accountId, workplaceCurrency);

  const pName = params.pName;
  const pBalance = params.pBalance;
  const pCurrency = params.pCurrency;
  const pIcon = params.pIcon;
  const pType = params.pType;
  const pColor = params.pColor;

  const account = useMemo<Account | PlainAccount | null>(
    () =>
      dbAccount ||
      (pName
        ? {
            id: accountId,
            name: pName,
            accountType: pType && isAccountType(pType) ? pType : AccountType.ASSET,
            currencyCode: pCurrency || workplaceCurrency,
            icon: (pIcon || getAccountFallbackIcon(pType)) as IconName,
            colorKey: pColor,
            deletedAt: undefined,
          }
        : null),
    [dbAccount, pName, accountId, pType, pCurrency, workplaceCurrency, pIcon, pColor],
  );

  const balanceData = useMemo(
    () =>
      dbBalanceData ||
      ((pBalance
        ? {
            accountId,
            balance: parseFloat(pBalance),
            currencyCode: pCurrency || account?.currencyCode || workplaceCurrency,
            transactionCount: 0,
          }
        : null) as AccountBalance | null),
    [dbBalanceData, pBalance, accountId, pCurrency, account?.currencyCode, workplaceCurrency],
  );

  const accountLoading = dashboardLoading && !pName;
  const rawAccountType = account?.accountType || '';
  const accountType = isAccountType(rawAccountType) ? rawAccountType : AccountType.ASSET;
  const balanceCurrency = balanceData?.currencyCode || account?.currencyCode || workplaceCurrency;
  // Unified resolved balance (DB or preview pBalance) — previously ignored pBalance for header text.
  const balance = balanceData?.balance ?? 0;
  const transactionCount = balanceData?.transactionCount || 0;
  const isDeleted = account?.deletedAt != null;

  const { data: reconciledAtMs } = useObservable(
    () =>
      accountId && workplaceId
        ? accountQueries.observeReconciledAt(workplaceId, accountId)
        : of(null),
    [accountId, workplaceId],
    null as number | null,
  );

  // Observe archive state as a primitive; WatermelonDB model references are stable
  // across writes and are not safe as the source of React archive state.
  const { data: archivedAtMs } = useObservable(
    () =>
      accountId && workplaceId
        ? accountQueries.observeArchivedAt(workplaceId, accountId)
        : of(null),
    [accountId, workplaceId],
    null as number | null,
  );

  const isArchived = account ? archivedAtMs != null : false;

  const accountSubtypeLabel = account?.accountSubtype
    ? formatAccountSubtypeLabel(account.accountSubtype)
    : '';
  const accountTypeVariant = getAccountTypeVariant(accountType);
  const accountTypeColorKey = getAccountTypeColorKey(accountType);
  const balanceAmount = account ? balance : null;
  const transactionCountText = String(transactionCount);

  const onDateSelect = useCallback(
    (range: DateRange | null, filter: PeriodFilter) => {
      setFilter(range, filter);
      hidePicker();
    },
    [hidePicker, setFilter],
  );

  const { data: unreconciledMetrics } = useObservable<{ count: number; total: number }>(
    () => observeUnreconciledMetrics(workplaceId, accountId, reconciledAtMs, accountType),
    [workplaceId, accountId, reconciledAtMs, accountType],
    { count: 0, total: 0 },
  );

  return {
    accountId,
    workplaceId,
    workplaceCurrency,
    account,
    balanceData,
    accounts,
    rawSubBalances,
    dashboardLoading,
    accountLoading,
    accountMissing: !accountLoading && !account,
    accountName: account?.name || '',
    accountType,
    accountSubtypeLabel,
    accountTypeVariant,
    accountIcon: account?.icon || null,
    accountTypeColorKey,
    accountColor: account?.color || '',
    isDeleted,
    isArchived,
    balanceCurrency,
    balanceAmount,
    transactionCount,
    transactionCountText,
    reconciledAtMs,
    dateRange,
    periodFilter,
    isDatePickerVisible,
    showDatePicker,
    hideDatePicker: hidePicker,
    navigatePrevious,
    navigateNext,
    onDateSelect,
    unreconciledCount: unreconciledMetrics.count,
    unreconciledAmount: unreconciledMetrics.total,
  };
}
