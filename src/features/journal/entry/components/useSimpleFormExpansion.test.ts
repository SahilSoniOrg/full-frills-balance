import { act, renderHook } from '@testing-library/react-native';
import { asAccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { resolveAutopilotExpansion, useSimpleFormExpansion } from './useSimpleFormExpansion';

jest.mock('@/src/hooks/useEaseInLayoutAnimation', () => ({
  useEaseInLayoutAnimation: () => jest.fn(),
}));

describe('resolveAutopilotExpansion', () => {
  it('opens the first empty role on a blank expense', () => {
    expect(
      resolveAutopilotExpansion({
        type: 'expense',
        sourceId: EMPTY_ACCOUNT_ID,
        destinationId: EMPTY_ACCOUNT_ID,
        firstRole: 'destination',
      }),
    ).toEqual({ expansionPosition: 'right', autopilotNextRole: 'source' });
  });

  it('moves to the other side after a suggestion fills the first role', () => {
    expect(
      resolveAutopilotExpansion({
        type: 'expense',
        sourceId: EMPTY_ACCOUNT_ID,
        destinationId: asAccountId('groceries'),
        firstRole: 'destination',
      }),
    ).toEqual({ expansionPosition: 'left', autopilotNextRole: null });
  });

  it('completes when both sides are already set', () => {
    expect(
      resolveAutopilotExpansion({
        type: 'expense',
        sourceId: asAccountId('cash'),
        destinationId: asAccountId('groceries'),
        firstRole: 'destination',
      }),
    ).toEqual({ expansionPosition: null, autopilotNextRole: null });
  });
});

describe('useSimpleFormExpansion', () => {
  it('keeps the side the user selected for expense entries', () => {
    const { result } = renderHook(() =>
      useSimpleFormExpansion({
        type: 'expense',
        sourceId: asAccountId('source'),
        destinationId: asAccountId('destination'),
        onSelectSource: jest.fn(),
        onSelectDestination: jest.fn(),
      }),
    );

    act(() => result.current.handleToggleExpansion('left'));
    expect(result.current.expansionPosition).toBe('left');

    act(() => result.current.handleToggleExpansion('right'));
    expect(result.current.expansionPosition).toBe('right');

    act(() => result.current.handleToggleExpansion('left'));
    expect(result.current.expansionPosition).toBe('left');
  });

  it('opens the first empty account role after description handoff', () => {
    const { result } = renderHook(() =>
      useSimpleFormExpansion({
        type: 'expense',
        sourceId: asAccountId('source'),
        destinationId: EMPTY_ACCOUNT_ID,
        autopilotFirstRole: 'destination',
        onSelectSource: jest.fn(),
        onSelectDestination: jest.fn(),
      }),
    );

    expect(result.current.expansionPosition).toBe('right');
    act(() => result.current.startAutopilotAccountFlow());
    expect(result.current.expansionPosition).toBe('right');
  });

  it('finalizes a suggested destination and opens the other side', () => {
    const { result } = renderHook(() =>
      useSimpleFormExpansion({
        type: 'expense',
        sourceId: EMPTY_ACCOUNT_ID,
        destinationId: EMPTY_ACCOUNT_ID,
        autopilotFirstRole: 'destination',
        onSelectSource: jest.fn(),
        onSelectDestination: jest.fn(),
      }),
    );

    act(() =>
      result.current.startAutopilotAccountFlow({
        role: 'destination',
        id: asAccountId('groceries'),
      }),
    );
    expect(result.current.expansionPosition).toBe('left');
  });

  it('completes when a suggestion fills the last empty account', () => {
    const { result } = renderHook(() =>
      useSimpleFormExpansion({
        type: 'expense',
        sourceId: asAccountId('cash'),
        destinationId: EMPTY_ACCOUNT_ID,
        autopilotFirstRole: 'destination',
        onSelectSource: jest.fn(),
        onSelectDestination: jest.fn(),
      }),
    );

    act(() =>
      result.current.startAutopilotAccountFlow({
        role: 'destination',
        id: asAccountId('groceries'),
      }),
    );
    expect(result.current.expansionPosition).toBeNull();
  });
});
