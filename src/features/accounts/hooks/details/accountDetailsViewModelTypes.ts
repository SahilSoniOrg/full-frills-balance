import type { JournalListModalsProps } from '@/src/features/journal';
import type { ListSelectionChrome } from '@/src/components/common/SelectionActionBar';
import { IconName } from '@/src/components/core';
import { PeriodMetrics } from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import { SubAccountViewModel } from '@/src/features/accounts/hooks/details/useAccountHierarchyTree';
import { AccountType, JournalId } from '@/src/types/domain';
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
  /** Custom per-account color (hex, '' = auto/derive from type). */
  accountColor?: string;
  isParent: boolean;
  isDeleted: boolean;
  isArchived: boolean;
  subAccountCount: number;
  onShowSubAccounts: () => void;
  balanceAmount: number | null;
  secondaryBalances: { currencyCode: string; amount: number }[];
  transactionCountText: string;
  onAuditPress: () => void;
}

export interface AccountActivitySectionModel {
  dateRange: DateRange | null;
  onShowDatePicker: () => void;
  onPreviousPeriod?: () => void;
  onNextPeriod?: () => void;
  chartData: { x: number; y: number }[];
  rollingAverageData: { x: number; y: number }[];
  xTicks: number[];
  periodMetrics: PeriodMetrics;
  onReconcile?: () => void;
  unreconciledCount: number;
}

export type AccountDetailsListHeaderModel = {
  accountType: string;
  reconciledAtMs: number | null;
  currencyCode: string;
  summary: AccountSummaryCardModel;
  activity: AccountActivitySectionModel;
};

export interface AccountDetailsHeaderActions {
  canRecover: boolean;
  onRecover: () => void;
  onEdit: () => void;
  onSearch?: () => void;
}

export interface AccountDetailsViewModel {
  accountLoading: boolean;
  accountMissing: boolean;
  accountType: AccountType;
  isParent: boolean;
  isDeleted: boolean;
  headerActions: AccountDetailsHeaderActions;
  onAddPress: () => void;
  onBack: () => void;
  listHeader: AccountDetailsListHeaderModel;
  isDatePickerVisible: boolean;
  hideDatePicker: () => void;
  periodFilter: PeriodFilter;
  onDateSelect: (range: DateRange | null, filter: PeriodFilter) => void;
  journalItems: JournalListItem[];
  journalsLoading: boolean;
  journalsLoadingMore: boolean;
  onLoadMore?: () => void;
  subAccounts: SubAccountViewModel[];
  subAccountsLoading: boolean;
  isSubAccountsModalVisible: boolean;
  onHideSubAccounts: () => void;
  isReconcileModalVisible: boolean;
  setIsReconcileModalVisible: (visible: boolean) => void;
  onConfirmReconcile: () => void;
  balanceAmount: number | null;
  currencyCode: string;
  unreconciledCount: number;
  selectedIds: Set<JournalId>;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  selectionChrome: ListSelectionChrome;
  modals?: JournalListModalsProps;
}
