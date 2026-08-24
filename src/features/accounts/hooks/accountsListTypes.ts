import type { ListSelectionChrome } from '@/src/components/common/SelectionActionBar';
import type { IconName } from '@/src/components/core';
import type { HierarchyCandidateAccount } from '@/src/features/accounts/helpers/bulkHierarchyCandidates';
import type {
  AccountCardViewModel,
  AccountSectionViewModel,
} from '@/src/features/accounts/utils/transformAccounts';
import { AccountId } from '@/src/types/ids';

export type AccountsListActiveModal =
  | { type: 'actionSheet'; account: AccountCardViewModel }
  | { type: 'appearance'; account: AccountCardViewModel }
  | { type: 'bulkRename' }
  | { type: 'bulkAppearance'; mode: 'icon' | 'color' }
  | { type: 'bulkHierarchy' }
  | null;

export interface AccountsListModalsProps {
  activeModal: AccountsListActiveModal;
  onCloseModal: () => void;
  selectedAccountsList: AccountCardViewModel[];
  selectedCount: number;
  bulkParentCandidates: HierarchyCandidateAccount[];
  onBulkRenameSave: (namesByAccountId: Record<AccountId, string>) => Promise<void> | void;
  onBulkHierarchyMoveAssign: (parentId: AccountId | null) => Promise<void> | void;
  onBulkAppearanceSelect: (updates: { icon?: IconName; color?: string }) => Promise<void> | void;
  onViewDetails?: (account: AccountCardViewModel) => void;
  onEditAccount?: (account: AccountCardViewModel) => void;
  onRecolorAccount?: (account: AccountCardViewModel) => void;
  onReconcileAccount?: (account: AccountCardViewModel) => void;
  onToggleArchiveAccount?: (account: AccountCardViewModel) => void;
  onDeleteAccount?: (account: AccountCardViewModel) => void;
  onAppearanceUpdate: (updates: { icon?: IconName; color?: string }) => Promise<void> | void;
}

export interface AccountsListViewModel {
  sections: AccountSectionViewModel[];
  onToggleSection: (title: string) => void;
  onToggleSectionSelect: (accountIds: AccountId[]) => void;
  onAccountPress: (accountId: AccountId) => void;
  onAccountLongPress: (account: AccountCardViewModel) => void;
  onAccountActionPress: (account: AccountCardViewModel) => void;
  selectedAccountIds: Set<AccountId>;
  isSelectionModeActive: boolean;
  selectionChrome: ListSelectionChrome;
  totalSelectableAccounts: number;
  modals: AccountsListModalsProps;
  onCollapseAccount: (accountId: AccountId) => void;
  onCreateAccount: () => void;
  onManageHierarchy: () => void;
  isLoading: boolean;
  version: number;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  totalIncome: number;
  totalExpense: number;
  inflowPeriod: 'overall' | 'month' | '30days';
  setInflowPeriod: (period: 'overall' | 'month' | '30days') => void;
  inflowIncome: number;
  inflowExpense: number;
  isPeriodLoading: boolean;
  currencyCode: string;
  activeTab: 'accounts' | 'categories';
  setActiveTab: (tab: 'accounts' | 'categories') => void;
  searchQuery: string;
  isSearching: boolean;
  onSearchChange: (query: string) => void;
  setIsSearching: (isSearching: boolean) => void;
  accountsForArchiveToggle: { archivedAt?: Date | number | null }[];
}
