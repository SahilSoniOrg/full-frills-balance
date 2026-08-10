import { IconName } from '@/src/components/core';
import { PeriodMetrics } from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import { SubAccountViewModel } from '@/src/features/accounts/hooks/details/useAccountHierarchyTree';
import { AccountId, JournalId } from '@/src/types/domain';
import { JournalListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { ComponentVariant } from '@/src/utils/style-helpers';

export type { PeriodMetrics, SubAccountViewModel };

export interface AccountSummaryCardModel {
  accountName: string;
  accountIcon: IconName | null;
  accountType: string;
  accountSubtypeLabel: string;
  accountTypeVariant: ComponentVariant;
  accountTypeColorKey: string;
  isParent: boolean;
  isDeleted: boolean;
  isArchived: boolean;
  subAccountCount: number;
  onShowSubAccounts: () => void;
  balanceAmount: number | null;
  currencyCode: string;
  secondaryBalances: { currencyCode: string; amount: number }[];
  transactionCountText: string;
  reconciledAtMs: number | null;
  onAuditPress: () => void;
}

export interface AccountActivitySectionModel {
  accountType: string;
  reconciledAtMs: number | null;
  dateRange: DateRange | null;
  onShowDatePicker: () => void;
  onPreviousPeriod?: () => void;
  onNextPeriod?: () => void;
  chartData: { x: number; y: number }[];
  rollingAverageData: { x: number; y: number }[];
  xTicks: number[];
  periodMetrics: PeriodMetrics;
  currencyCode: string;
  onReconcile?: () => void;
  unreconciledCount: number;
}

export interface AccountDetailsListHeaderModel {
  summary: AccountSummaryCardModel;
  activity: AccountActivitySectionModel;
}

export interface AccountDetailsViewModel {
  accountId: AccountId;
  accountLoading: boolean;
  accountMissing: boolean;
  accountName: string;
  accountType: string;
  accountSubtypeLabel: string;
  accountTypeVariant: string;
  accountIcon: IconName | null;
  accountTypeColorKey: string;
  isDeleted: boolean;
  isArchived: boolean;
  currencyCode: string;
  balanceAmount: number | null;
  transactionCountText: string;
  headerActions: {
    canRecover: boolean;
    onRecover: () => void;
    onEdit: () => void;
    onSearch?: () => void;
  };
  onReconcilePress?: () => void;
  isReconcileModalVisible: boolean;
  setIsReconcileModalVisible: (visible: boolean) => void;
  onConfirmReconcile: () => void;
  reconciledAtMs: number | null;
  listHeader: AccountDetailsListHeaderModel;
  onBack: () => void;
  onAuditPress: () => void;
  onAddPress: () => void;
  dateRange: DateRange | null;
  periodFilter: PeriodFilter;
  isDatePickerVisible: boolean;
  showDatePicker: () => void;
  hideDatePicker: () => void;
  navigatePrevious?: () => void;
  navigateNext?: () => void;
  onDateSelect: (range: DateRange | null, filter: PeriodFilter) => void;
  chartData: { x: number; y: number }[];
  rollingAverageData: { x: number; y: number }[];
  xTicks: number[];
  periodMetrics: PeriodMetrics;
  journalsLoading: boolean;
  journalsLoadingMore: boolean;
  journalItems: JournalListItem[];
  onLoadMore?: () => void;
  secondaryBalances: { currencyCode: string; amount: number }[];
  isParent: boolean;
  subAccountCount: number;
  subAccounts: SubAccountViewModel[];
  subAccountsLoading: boolean;
  isSubAccountsModalVisible: boolean;
  onShowSubAccounts: () => void;
  onHideSubAccounts: () => void;
  unreconciledCount: number;
  unreconciledAmount: number;
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  toggleSelection: (id: JournalId) => void;
  selectAll: () => void;
  clearItems: () => void;
  exitSelectionMode: () => void;
  onShareSelected: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<JournalId>>>;
}
