import type { AccountFields } from '@/src/types/plainDtos';
import { useVisibleAccounts } from '@/src/contexts/ArchiveVisibilityScope';
import { AccountId } from '@/src/types/ids';
import { PlainAccount } from '@/src/types/plainDtos';
import { getAccountSections } from '@/src/utils/accountCategory';
import { useCallback, useEffect, useMemo, useState } from 'react';

const EMPTY_ACCOUNTS: (AccountFields | PlainAccount)[] = [];

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export function useAccountPickerList({
  accounts,
  excludeParentAccounts,
  pinnedAccountIds = new Set<AccountId>(),
  enabled = true,
}: {
  accounts: (AccountFields | PlainAccount)[];
  excludeParentAccounts: boolean;
  pinnedAccountIds?: ReadonlySet<AccountId>;
  enabled?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 150);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const isSearchMode = debouncedSearch.trim().length > 0;

  const visibleAccounts = useVisibleAccounts(enabled ? accounts : EMPTY_ACCOUNTS, pinnedAccountIds);

  const filteredAccounts = useMemo(() => {
    if (visibleAccounts.length === 0) return [];

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
    return enabled ? getAccountSections(filteredAccounts) : [];
  }, [enabled, filteredAccounts]);

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
