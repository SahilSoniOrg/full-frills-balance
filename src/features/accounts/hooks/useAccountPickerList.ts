import Account from '@/src/data/models/Account';
import { useDebounce } from '@/src/hooks/useDebounce';
import { PlainAccount } from '@/src/types/domain';
import { getAccountSections } from '@/src/utils/accountCategory';
import { useCallback, useMemo, useState } from 'react';

/**
 * useAccountPickerList - Logic hook for the account picker.
 * Handles searching, grouping, and section collapse state.
 */
export function useAccountPickerList({
  accounts,
  excludeParentAccounts,
}: {
  accounts: (Account | PlainAccount)[];
  excludeParentAccounts: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 150);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const isSearchMode = debouncedSearch.trim().length > 0;

  const filteredAccounts = useMemo(() => {
    if (!accounts || accounts.length === 0) return [];

    let result = accounts;
    if (isSearchMode) {
      const q = debouncedSearch.toLowerCase().trim();
      result = accounts.filter(
        a =>
          a.name.toLowerCase().includes(q) ||
          a.accountType.toLowerCase().includes(q) ||
          (a.currencyCode && a.currencyCode.toLowerCase().includes(q)),
      );
    }

    if (excludeParentAccounts) {
      // Robust check: any account that is referenced as a parent
      const accountsWithChildren = new Set(
        accounts.map(a => a.parentAccountId).filter(Boolean) as string[],
      );
      result = result.filter(a => !accountsWithChildren.has(a.id));
    }

    return result;
  }, [accounts, debouncedSearch, isSearchMode, excludeParentAccounts]);

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
    totalCount: accounts.length,
    filteredCount: filteredAccounts.length,
  };
}
