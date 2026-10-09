import type { DetailMenuAction } from '@/src/components/shared/DetailHeaderMenuActions';
import type { AccountArchiveCascadeModalProps } from '@/src/features/accounts/components/AccountArchiveCascadeModal';
import type { AccountMergePickerModalProps } from '@/src/features/accounts/hooks/useAccountDeleteMergeActions';
import type { JournalListModalsProps } from '@/src/features/journal';
import type { ListSelectionChrome } from '@/src/components/shared/SelectionActionBar';
import type { ScreenHeaderActionItem } from '@/src/components/shared/ScreenHeaderActions';
import { IconName } from '@/src/components/core';
import {
  PeriodMetrics,
  PreviousPeriodMetrics,
} from '@/src/features/accounts/hooks/details/useAccountDetailsMetrics';
import {
  AncestorAccountViewModel,
  SubAccountViewModel,
} from '@/src/features/accounts/hooks/details/useAccountHierarchyTree';
import { AccountType } from '@/src/types/enums';
import { AccountId, JournalId } from '@/src/types/ids';
import { JournalListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { ComponentVariant } from '@/src/utils/style-helpers';

export type { AncestorAccountViewModel, PeriodMetrics, SubAccountViewModel };

export interface AccountSummaryCardModel {
  accountName: string;
  accountIcon: IconName | null;
  accountType: AccountType;
  accountSubtypeLabel: string;
  accountTypeVariant: ComponentVariant;
  /** Custom per-account color (hex, '' = auto/derive from type). */
  accountColor?: string;
  isParent: boolean;
  /** Outermost first; empty for top-level accounts. */
  ancestorPath: AncestorAccountViewModel[];
  onOpenAncestor: (ancestorId: AccountId) => void;
  isDeleted: boolean;
  isArchived: boolean;
  subAccountCount: number;
  onShowSubAccounts: () => void;
  balanceAmount: number | null;
  secondaryBalances: { currencyCode: string; amount: number }[];
  transactionCountText: string;
  reconciledAtMs: number | null;
  onAuditPress: () => void;
  /** Absent for categories and deleted accounts, which can't be matched to a statement. */
  onReconcile?: () => void;
  unreconciledCount: number;
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
  previousPeriod: PreviousPeriodMetrics | null;
}

export type AccountDetailsListHeaderModel = {
  currencyCode: string;
  summary: AccountSummaryCardModel;
  activity: AccountActivitySectionModel;
};

export interface AccountDetailsHeaderActions {
  leading: ScreenHeaderActionItem[];
  menu: DetailMenuAction[];
}

export interface AccountDetailsViewModel {
  accountName: string;
  accountLoading: boolean;
  accountMissing: boolean;
  accountType: AccountType;
  isParent: boolean;
  isDeleted: boolean;
  isArchived: boolean;
  headerActions: AccountDetailsHeaderActions;
  onAddPress: () => void;
  onBack: () => void;
  archiveCascadeModal: AccountArchiveCascadeModalProps | null;
  mergePickerModal: AccountMergePickerModalProps | null;
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
  onOpenSubAccount: (subAccount: SubAccountViewModel) => void;
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
