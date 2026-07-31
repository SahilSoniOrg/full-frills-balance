import { AccountsListTab } from '@/src/features/accounts/helpers/accountsListHelpers';
import { AccountId } from '@/src/types/domain';
import { useCallback, useState } from 'react';

export function useAccountsListUiState() {
  const [activeTab, setActiveTab] = useState<AccountsListTab>('accounts');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(['Equity']),
  );
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<AccountId>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const onToggleSection = useCallback((title: string) => {
    setCollapsedSections(previous => {
      const next = new Set(previous);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  const onCollapseAccount = useCallback((accountId: AccountId) => {
    setExpandedAccountIds(previous => {
      const next = new Set(previous);
      next.delete(accountId);
      return next;
    });
  }, []);

  return {
    activeTab,
    setActiveTab,
    collapsedSections,
    expandedAccountIds,
    setExpandedAccountIds,
    searchQuery,
    setSearchQuery,
    isSearching,
    setIsSearching,
    onToggleSection,
    onCollapseAccount,
  };
}
