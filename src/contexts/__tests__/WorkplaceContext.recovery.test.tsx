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
      <WorkplaceProvider workplaceId={'target-wp' as WorkplaceId} {...transitionProps}>
        <ContextProbe />
      </WorkplaceProvider>,
    );

    expect(mockUseWorkplaceSnapshot).toHaveBeenCalledWith('target-wp');
    expect(getByText('target-wp:INR')).toBeTruthy();
  });

  it('does not render children while the target row is loading', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({ data: null, error: null });

    const { queryByText } = render(
      <WorkplaceProvider workplaceId={'target-wp' as WorkplaceId} {...transitionProps}>
        <Text>child</Text>
      </WorkplaceProvider>,
    );

    expect(queryByText('child')).toBeNull();
    expect(snapshotService.getCustomSnapshot).not.toHaveBeenCalled();
  });

  it('does not render children for a missing target row or mutate launch preferences', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({
      data: null,
      error: new Error('Workplace not found: target-wp'),
    });

    const { queryByText } = render(
      <WorkplaceProvider workplaceId={'target-wp' as WorkplaceId} {...transitionProps}>
        <Text>child</Text>
      </WorkplaceProvider>,
    );

    expect(queryByText('child')).toBeNull();
    expect(preferences.device.setActiveWorkplaceId).not.toHaveBeenCalled();
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
      <WorkplaceProvider workplaceId={'target-wp' as WorkplaceId} {...transitionProps}>
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
        workplaceId={'target-wp' as WorkplaceId}
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
