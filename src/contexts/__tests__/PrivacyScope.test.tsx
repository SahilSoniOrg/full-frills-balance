import { preferences } from '@/src/services/preferences';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';
import {
  PrimaryPrivacyScopeStoreProvider,
  PrivacyScopeProvider,
  useEffectivePrivacyMode,
  usePrivacyScope,
  withPrivacyScope,
} from '../PrivacyScope';

function wrap(globalPrivacyMode: boolean) {
  preferences.privacy.setIsPrivacyMode(globalPrivacyMode);
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <PrivacyScopeProvider>{children}</PrivacyScopeProvider>;
  }
  Wrapper.displayName = 'PrivacyScopeTestWrapper';
  return Wrapper;
}

describe('PrivacyScopeProvider', () => {
  beforeEach(() => {
    preferences.privacy.setIsPrivacyMode(false);
  });

  it('mirrors global privacy prefs when there is no override', () => {
    const { result, rerender } = renderHook(() => useEffectivePrivacyMode(), {
      wrapper: wrap(false),
    });

    expect(result.current).toBe(false);

    act(() => {
      preferences.privacy.setIsPrivacyMode(true);
    });
    rerender({});
    expect(result.current).toBe(true);
  });

  it('locks screen override until the user toggles again (charting lock)', () => {
    const { result } = renderHook(
      () => ({
        effective: useEffectivePrivacyMode(),
        scope: usePrivacyScope(),
      }),
      { wrapper: wrap(false) },
    );

    expect(result.current.effective).toBe(false);

    act(() => {
      result.current.scope.togglePrivacyMode();
    });
    expect(result.current.effective).toBe(true);

    act(() => {
      preferences.privacy.setIsPrivacyMode(true);
    });
    expect(result.current.effective).toBe(true);

    act(() => {
      preferences.privacy.setIsPrivacyMode(false);
    });
    // Override sticks — global flip must not yank the screen back.
    expect(result.current.effective).toBe(true);

    act(() => {
      result.current.scope.togglePrivacyMode();
    });
    expect(result.current.effective).toBe(false);
  });

  it('falls back to global prefs outside a provider', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const { result } = renderHook(() => useEffectivePrivacyMode());
    expect(result.current).toBe(true);
  });

  it('throws when usePrivacyScope is used outside a provider', () => {
    expect(() => renderHook(() => usePrivacyScope())).toThrow(/PrivacyScopeProvider/);
  });
});

describe('withPrivacyScope', () => {
  beforeEach(() => {
    preferences.privacy.setIsPrivacyMode(false);
  });

  it('provides privacy scope to the wrapped component tree', () => {
    const ScopeHost = withPrivacyScope(function ScopeHost({
      children,
    }: {
      children?: React.ReactNode;
    }) {
      return <>{children}</>;
    });

    const { result } = renderHook(() => usePrivacyScope(), {
      wrapper: ({ children }) => <ScopeHost>{children}</ScopeHost>,
    });

    expect(result.current.isPrivacyMode).toBe(false);
    act(() => {
      result.current.togglePrivacyMode();
    });
    expect(result.current.isPrivacyMode).toBe(true);
  });
});

describe('PrimaryPrivacyScopeStoreProvider', () => {
  beforeEach(() => {
    preferences.privacy.setIsPrivacyMode(false);
  });

  function ScopedProbe({ id, scopeKey }: { id: string; scopeKey: string }) {
    return (
      <PrivacyScopeProvider scopeKey={scopeKey}>
        <ScopedProbeInner id={id} />
      </PrivacyScopeProvider>
    );
  }

  function ScopedProbeInner({ id }: { id: string }) {
    const scope = usePrivacyScope();
    return (
      <>
        <Text testID={`${id}-mode`}>{String(scope.isPrivacyMode)}</Text>
        <Pressable testID={`${id}-toggle`} onPress={scope.togglePrivacyMode} />
      </>
    );
  }

  it('shares overrides across providers with the same scopeKey', () => {
    render(
      <PrimaryPrivacyScopeStoreProvider>
        <ScopedProbe id="accounts-a" scopeKey="accounts" />
        <ScopedProbe id="accounts-b" scopeKey="accounts" />
      </PrimaryPrivacyScopeStoreProvider>,
    );

    expect(screen.getByTestId('accounts-a-mode').props.children).toBe('false');
    fireEvent.press(screen.getByTestId('accounts-a-toggle'));
    expect(screen.getByTestId('accounts-a-mode').props.children).toBe('true');
    expect(screen.getByTestId('accounts-b-mode').props.children).toBe('true');
  });

  it('keeps distinct scopeKeys independent', () => {
    render(
      <PrimaryPrivacyScopeStoreProvider>
        <ScopedProbe id="accounts" scopeKey="accounts" />
        <ScopedProbe id="commitments" scopeKey="commitments" />
      </PrimaryPrivacyScopeStoreProvider>,
    );

    fireEvent.press(screen.getByTestId('accounts-toggle'));
    expect(screen.getByTestId('accounts-mode').props.children).toBe('true');
    expect(screen.getByTestId('commitments-mode').props.children).toBe('false');
  });
});
