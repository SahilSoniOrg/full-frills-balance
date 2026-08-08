import { AccountId, AccountType } from '@/src/types/domain';
import {
  ArchiveVisibilityScopeProvider,
  useArchiveVisibility,
  useVisibleAccounts,
  withArchiveVisibilityScope,
} from '@/src/contexts/ArchiveVisibilityScope';
import { act, renderHook } from '@testing-library/react-native';
import React from 'react';

const accounts = [
  {
    id: 'active' as AccountId,
    name: 'Active',
    accountType: AccountType.ASSET,
    archivedAt: undefined,
  },
  {
    id: 'archived' as AccountId,
    name: 'Archived',
    accountType: AccountType.ASSET,
    archivedAt: new Date('2026-01-01'),
  },
];

function wrapWithScope() {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <ArchiveVisibilityScopeProvider>{children}</ArchiveVisibilityScopeProvider>;
  }
  Wrapper.displayName = 'ArchiveVisibilityScopeTestWrapper';
  return Wrapper;
}

describe('ArchiveVisibilityScope', () => {
  it('hides archived accounts by default without a provider', () => {
    const { result } = renderHook(() => useVisibleAccounts(accounts));
    expect(result.current.map(a => a.id)).toEqual(['active']);
  });

  it('shows archived accounts when scope toggle is on', () => {
    const { result } = renderHook(
      () => ({
        visible: useVisibleAccounts(accounts),
        scope: useArchiveVisibility(),
      }),
      { wrapper: wrapWithScope() },
    );

    expect(result.current.visible.map(a => a.id)).toEqual(['active']);

    act(() => {
      result.current.scope.setShowArchived(true);
    });

    expect(result.current.visible.map(a => a.id)).toEqual(['active', 'archived']);
  });

  it('keeps pinned archived accounts visible when showArchived is false', () => {
    const { result } = renderHook(
      () => useVisibleAccounts(accounts, new Set<AccountId>(['archived' as AccountId])),
      { wrapper: wrapWithScope() },
    );

    expect(result.current.map(a => a.id)).toEqual(['active', 'archived']);
  });

  it('throws when useArchiveVisibility is used outside a provider', () => {
    expect(() => renderHook(() => useArchiveVisibility())).toThrow(
      /useArchiveVisibility must be used within ArchiveVisibilityScopeProvider/,
    );
  });

  it('wraps components with an archive visibility provider', () => {
    const Host = withArchiveVisibilityScope(function Host({
      children,
    }: {
      children?: React.ReactNode;
    }) {
      return <>{children}</>;
    });

    const { result } = renderHook(() => useArchiveVisibility(), {
      wrapper: ({ children }) => <Host>{children}</Host>,
    });

    expect(result.current.showArchived).toBe(false);
    act(() => {
      result.current.setShowArchived(true);
    });
    expect(result.current.showArchived).toBe(true);
  });
});
