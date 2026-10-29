import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { WorkplaceContext, WorkplaceProvider } from '@/src/contexts/WorkplaceContext';
import { preferences } from '@/src/services/preferences';
import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { snapshotService } from '@/src/utils/SnapshotService';
import { WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/services/preferences', () => ({
  preferences: {
    device: {
      activeWorkplaceId: 'active-wp',
      setActiveWorkplaceId: jest.fn(),
    },
  },
}));

jest.mock('@/src/services/reactive/evictWorkplaceReactiveCaches', () => ({
  evictWorkplaceReactiveCaches: jest.fn(),
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: { logWorkplaceSwitched: jest.fn() },
}));

jest.mock('@/src/hooks/useWorkplaceSnapshot');

jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: {
    deferCustomSnapshot: jest.fn(),
    getCustomSnapshot: jest.fn(),
  },
}));

const mockUseWorkplaceSnapshot = useWorkplaceSnapshot as jest.Mock;

function ContextProbe() {
  const value = React.useContext(WorkplaceContext);
  return <Text>{value ? `${value.workplaceId}:${value.defaultCurrencyCode}` : 'missing'}</Text>;
}

const transitionProps = {
  onSwitchWorkplace: jest.fn().mockResolvedValue(undefined),
  onDeleteWorkplace: jest.fn().mockResolvedValue(undefined),
};

describe('WorkplaceProvider books boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the coordinator-supplied ID to the snapshot observer', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({
      data: { id: 'target-wp', defaultCurrencyCode: 'INR' },
      error: null,
    });

    const { getByText } = render(
      <WorkplaceProvider targetWorkplaceId={'target-wp' as WorkplaceId} {...transitionProps}>
        <ContextProbe />
      </WorkplaceProvider>,
    );

    expect(mockUseWorkplaceSnapshot).toHaveBeenCalledWith('target-wp');
    expect(getByText('target-wp:INR')).toBeTruthy();
  });

  it('does not render children while the target row is loading', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({ data: null, error: null });

    const { queryByText } = render(
      <WorkplaceProvider targetWorkplaceId={'target-wp' as WorkplaceId} {...transitionProps}>
        <Text>child</Text>
      </WorkplaceProvider>,
    );

    expect(queryByText('child')).toBeNull();
    expect(snapshotService.getCustomSnapshot).not.toHaveBeenCalled();
  });

  it('mounts books from the launch-discovered row before the observer emits', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({ data: null, error: null, isLoading: true });

    const { getByText, queryByText, rerender } = render(
      <WorkplaceProvider
        targetWorkplaceId={'target-wp' as WorkplaceId}
        initialWorkplace={
          {
            id: 'target-wp',
            defaultCurrencyCode: 'INR',
          } as NonNullable<ReturnType<typeof useWorkplaceSnapshot>['data']>
        }
        {...transitionProps}
      >
        <ContextProbe />
      </WorkplaceProvider>,
    );

    expect(getByText('target-wp:INR')).toBeTruthy();
    expect(mockUseWorkplaceSnapshot).toHaveBeenCalledWith('target-wp');

    mockUseWorkplaceSnapshot.mockReturnValue({
      data: null,
      error: new Error('Workplace not found: target-wp'),
      isLoading: false,
    });
    rerender(
      <WorkplaceProvider
        targetWorkplaceId={'target-wp' as WorkplaceId}
        initialWorkplace={
          {
            id: 'target-wp',
            defaultCurrencyCode: 'INR',
          } as NonNullable<ReturnType<typeof useWorkplaceSnapshot>['data']>
        }
        {...transitionProps}
      >
        <ContextProbe />
      </WorkplaceProvider>,
    );
    expect(queryByText('target-wp:INR')).toBeNull();
  });

  it('keeps the nav tree mounted across a switch while the previous snapshot is still showing', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({
      data: { id: 'from-wp', defaultCurrencyCode: 'INR' },
      error: null,
    });

    const { getByText, rerender, queryByText } = render(
      <WorkplaceProvider targetWorkplaceId={'from-wp' as WorkplaceId} {...transitionProps}>
        <ContextProbe />
      </WorkplaceProvider>,
    );
    expect(getByText('from-wp:INR')).toBeTruthy();

    // Pointer already moved; useObservable still emits the previous row.
    mockUseWorkplaceSnapshot.mockReturnValue({
      data: { id: 'from-wp', defaultCurrencyCode: 'INR' },
      error: null,
    });
    rerender(
      <WorkplaceProvider
        targetWorkplaceId={'to-wp' as WorkplaceId}
        isSwitchingWorkplace
        {...transitionProps}
      >
        <ContextProbe />
      </WorkplaceProvider>,
    );
    expect(getByText('from-wp:INR')).toBeTruthy();

    mockUseWorkplaceSnapshot.mockReturnValue({
      data: { id: 'to-wp', defaultCurrencyCode: 'USD' },
      error: null,
    });
    rerender(
      <WorkplaceProvider targetWorkplaceId={'to-wp' as WorkplaceId} {...transitionProps}>
        <ContextProbe />
      </WorkplaceProvider>,
    );
    expect(getByText('to-wp:USD')).toBeTruthy();
    expect(queryByText('from-wp:INR')).toBeNull();
  });

  it('does not render children for a missing target row or mutate launch preferences', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({
      data: null,
      error: new Error('Workplace not found: target-wp'),
    });

    const { queryByText } = render(
      <WorkplaceProvider targetWorkplaceId={'target-wp' as WorkplaceId} {...transitionProps}>
        <Text>child</Text>
      </WorkplaceProvider>,
    );

    expect(queryByText('child')).toBeNull();
    expect(preferences.device.setActiveWorkplaceId).not.toHaveBeenCalled();
  });

  it('does not render books from the last snapshot of a workplace deleted outside a switch', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({
      data: { id: 'target-wp', defaultCurrencyCode: 'INR' },
      error: new Error('Workplace not found: target-wp'),
    });

    const { queryByText } = render(
      <WorkplaceProvider targetWorkplaceId={'target-wp' as WorkplaceId} {...transitionProps}>
        <Text>child</Text>
      </WorkplaceProvider>,
    );

    expect(queryByText('child')).toBeNull();
  });

  it('does not authorize a mismatched row or cached currency', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({
      data: { id: 'other-wp', defaultCurrencyCode: 'INR' },
      error: null,
    });
    (snapshotService.getCustomSnapshot as jest.Mock).mockReturnValue({
      defaultCurrencyCode: 'USD',
    });

    const { queryByText } = render(
      <WorkplaceProvider targetWorkplaceId={'target-wp' as WorkplaceId} {...transitionProps}>
        <Text>child</Text>
      </WorkplaceProvider>,
    );

    expect(queryByText('child')).toBeNull();
    expect(snapshotService.getCustomSnapshot).not.toHaveBeenCalled();
  });

  it('delegates workplace changes to the coordinator when provided', async () => {
    mockUseWorkplaceSnapshot.mockReturnValue({
      data: { id: 'target-wp', defaultCurrencyCode: 'INR' },
      error: null,
    });
    const onSwitchWorkplace = jest.fn().mockResolvedValue(undefined);
    const onDeleteWorkplace = jest.fn().mockResolvedValue(undefined);
    function ActionProbe() {
      const context = React.useContext(WorkplaceContext);
      React.useEffect(() => {
        void context!.setWorkplaceId('next-wp' as WorkplaceId);
      }, [context]);
      return null;
    }

    render(
      <WorkplaceProvider
        targetWorkplaceId={'target-wp' as WorkplaceId}
        onSwitchWorkplace={onSwitchWorkplace}
        onDeleteWorkplace={onDeleteWorkplace}
      >
        <ActionProbe />
      </WorkplaceProvider>,
    );

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(onSwitchWorkplace).toHaveBeenCalledWith('next-wp');
  });
});
