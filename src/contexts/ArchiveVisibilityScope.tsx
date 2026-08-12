import { AccountId } from '@/src/types/domain';
import { filterAccountsForDisplay, hasArchivedAccountsInList } from '@/src/utils/accountArchive';
import React, { createContext, useContext, useMemo, useState, type ComponentType } from 'react';

export type ArchiveVisibilityValue = {
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
};

type ArchiveAccountRef = { id: string; archivedAt?: Date | number | null };

const ArchiveVisibilityScopeContext = createContext<ArchiveVisibilityValue | null>(null);

/**
 * Ephemeral archive visibility for a screen or modal.
 * Resets when the provider unmounts (screen leave / modal close).
 */
export function ArchiveVisibilityScopeProvider({
  children,
  initialShowArchived = false,
}: {
  children: React.ReactNode;
  initialShowArchived?: boolean;
}) {
  const [showArchived, setShowArchived] = useState(initialShowArchived);
  const value = useMemo(() => ({ showArchived, setShowArchived }), [showArchived]);

  return (
    <ArchiveVisibilityScopeContext.Provider value={value}>
      {children}
    </ArchiveVisibilityScopeContext.Provider>
  );
}

export function withArchiveVisibilityScope<P extends object>(
  Component: ComponentType<P>,
): ComponentType<P> {
  function Wrapped(props: P) {
    return (
      <ArchiveVisibilityScopeProvider>
        <Component {...props} />
      </ArchiveVisibilityScopeProvider>
    );
  }
  const name = Component.displayName ?? Component.name ?? 'Component';
  Wrapped.displayName = `withArchiveVisibilityScope(${name})`;
  return Wrapped;
}

/** Requires ArchiveVisibilityScopeProvider — used by toggle and scoped screens. */
export function useArchiveVisibility(): ArchiveVisibilityValue {
  const scope = useContext(ArchiveVisibilityScopeContext);
  if (!scope) {
    throw new Error('useArchiveVisibility must be used within ArchiveVisibilityScopeProvider');
  }
  return scope;
}

/**
 * Filters accounts for display using the nearest archive visibility scope.
 * Without a provider, archived accounts are hidden (safe default for read paths).
 * Pinned ids (e.g. already-selected archived accounts) always remain visible.
 */
export function useVisibleAccounts<T extends ArchiveAccountRef>(
  accounts: T[],
  pinnedIds: ReadonlySet<AccountId> = new Set(),
): T[] {
  const scope = useContext(ArchiveVisibilityScopeContext);
  const showArchived = scope?.showArchived ?? false;
  return useMemo(
    () => filterAccountsForDisplay(accounts, showArchived, pinnedIds),
    [accounts, pinnedIds, showArchived],
  );
}

/**
 * List-surface helper: visibility-filtered accounts + whether the toggle should appear.
 * Prefer this over calling useVisibleAccounts and hasArchivedAccountsInList separately.
 */
export function useArchiveScopedAccounts<T extends ArchiveAccountRef>(
  accounts: T[],
  pinnedIds: ReadonlySet<AccountId> = new Set(),
): { visibleAccounts: T[]; hasArchivedAccounts: boolean } {
  const visibleAccounts = useVisibleAccounts(accounts, pinnedIds);
  const hasArchivedAccounts = useMemo(() => hasArchivedAccountsInList(accounts), [accounts]);
  return { visibleAccounts, hasArchivedAccounts };
}
