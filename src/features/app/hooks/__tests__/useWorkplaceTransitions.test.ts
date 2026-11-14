import { asWorkplaceId } from '@/src/types/ids';
import {
  rollbackFailedWorkplaceTransition,
  shouldRollbackWorkplacePointer,
  shouldSkipWorkplaceTransition,
} from '../useWorkplaceTransitions';

describe('workplace transition recovery', () => {
  const previousId = asWorkplaceId('previous-workplace');
  const targetId = asWorkplaceId('created-workplace');

  it('does not skip strict recovery when the target is already active', () => {
    expect(shouldSkipWorkplaceTransition(targetId, targetId, false)).toBe(true);
    expect(shouldSkipWorkplaceTransition(targetId, targetId, true)).toBe(false);
  });

  it('rolls back a stale active target after strict retry fails before switching', () => {
    expect(
      shouldRollbackWorkplacePointer({
        pointerMoved: false,
        strict: true,
        targetWasActiveAtStart: true,
        fromWorkplaceId: previousId,
        targetWorkplaceId: targetId,
      }),
    ).toBe(true);
    expect(
      shouldRollbackWorkplacePointer({
        pointerMoved: false,
        strict: false,
        targetWasActiveAtStart: true,
        fromWorkplaceId: previousId,
        targetWorkplaceId: targetId,
      }),
    ).toBe(false);
    expect(
      shouldRollbackWorkplacePointer({
        pointerMoved: false,
        strict: true,
        targetWasActiveAtStart: true,
        targetWorkplaceId: targetId,
      }),
    ).toBe(true);
  });

  it('restores the previous active pointer and exact root history after a failed open', async () => {
    const previousNavigationState = {
      key: 'root',
      index: 1,
      routes: [{ key: 'tabs', name: '(tabs)' }, { key: 'detail', name: 'account-details' }],
    };
    const safeNavigationState = { key: 'root', index: 0, routes: [{ key: 'tabs', name: '(tabs)' }] };
    let activeId = targetId;
    const order: string[] = [];
    const resetRoot = jest.fn((state: typeof previousNavigationState | undefined) => {
      expect(state).toBe(previousNavigationState);
      order.push('history');
    });

    await rollbackFailedWorkplaceTransition({
      fromWorkplaceId: previousId,
      targetWorkplaceId: targetId,
      pointerMoved: true,
      historyRewritten: true,
      previousNavigationState,
      safeNavigationState,
      getActiveWorkplaceId: () => activeId,
      switchWorkplace: async id => {
        activeId = id;
        order.push('pointer');
      },
      restoreNavigation: state => resetRoot(state),
      onRollbackFailure: (_step, error) => {
        throw error;
      },
    });

    expect(activeId).toBe(previousId);
    expect(order).toEqual(['pointer', 'history']);
    expect(resetRoot).toHaveBeenCalledTimes(1);
  });

  it('keeps the rewritten safe route if pointer rollback itself fails', async () => {
    const previousNavigationState = {
      key: 'root',
      index: 1,
      routes: [{ key: 'tabs', name: '(tabs)' }, { key: 'detail', name: 'account-details' }],
    };
    const safeNavigationState = { key: 'root', index: 0, routes: [{ key: 'tabs', name: '(tabs)' }] };
    const restored: unknown[] = [];

    await rollbackFailedWorkplaceTransition({
      fromWorkplaceId: previousId,
      targetWorkplaceId: targetId,
      pointerMoved: true,
      historyRewritten: true,
      previousNavigationState,
      safeNavigationState,
      getActiveWorkplaceId: () => targetId,
      switchWorkplace: async () => {
        throw new Error('pointer rollback failed');
      },
      restoreNavigation: state => restored.push(state),
      onRollbackFailure: jest.fn(),
    });

    expect(restored).toEqual([safeNavigationState]);
    expect(restored).not.toContain(previousNavigationState);
  });
});
