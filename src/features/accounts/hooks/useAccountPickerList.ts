import type { AccountFields } from '@/src/types/plainDtos';
import { useArchiveScopedAccounts } from '@/src/contexts/ArchiveVisibilityScope';
import { useDebounce } from '@/src/hooks/useDebounce';
import { AccountId } from '@/src/types/ids';
import { PlainAccount } from '@/src/types/plainDtos';
import { getAccountSections } from '@/src/utils/accountCategory';
import { useCallback, useMemo, useState } from 'react';

/**
 * useAccountPickerList - Logic for the account picker.
 * Handles searching, grouping, section collapse state, and archive visibility.
 */
export function useAccountPickerList({
  accounts,
  excludeParentAccounts,
  pinnedAccountIds = new Set<AccountId>(),
}: {
  accounts: (AccountFields | PlainAccount)[];
  excludeParentAccounts: boolean;
  pinnedAccountIds?: ReadonlySet<AccountId>;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 150);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const isSearchMode = debouncedSearch.trim().length > 0;

  const { visibleAccounts } = useArchiveScopedAccounts(accounts, pinnedAccountIds);

  const filteredAccounts = useMemo(() => {
    if (!visibleAccounts || visibleAccounts.length === 0) return [];

    let result = visibleAccounts;
    if (isSearchMode) {
      const q = debouncedSearch.toLowerCase().trim();
      result = visibleAccounts.filter(
        a =>
          a.name.toLowerCase().includes(q) ||
          a.accountType.toLowerCase().includes(q) ||
          (a.currencyCode && a.currencyCode.toLowerCase().includes(q)),
      );
    }

    if (excludeParentAccounts) {
      const accountsWithChildren = new Set(
        accounts.map(a => a.parentAccountId).filter(Boolean) as string[],
      );
      result = result.filter(a => !accountsWithChildren.has(a.id));
    }

    return result;
  }, [accounts, visibleAccounts, debouncedSearch, isSearchMode, excludeParentAccounts]);

  const sections = useMemo(() => {
    return getAccountSections(filteredAccounts);
  }, [filteredAccounts]);

  const toggleSection = useCallback((sectionKey: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    sections,
    toggleSection,
    collapsedSections,
    isSearchMode,
    totalCount: visibleAccounts.length,
    filteredCount: filteredAccounts.length,
  };
}
