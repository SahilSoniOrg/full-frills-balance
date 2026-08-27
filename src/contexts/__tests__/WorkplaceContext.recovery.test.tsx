import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { WorkplaceProvider } from '@/src/contexts/WorkplaceContext';
import { preferences } from '@/src/utils/preferences';
import { useObservable } from '@/src/hooks/useObservable';
import { useWorkplaceSnapshot } from '@/src/hooks/useWorkplaceSnapshot';
import { snapshotService } from '@/src/utils/SnapshotService';

jest.mock('@/src/utils/preferences', () => ({
  preferences: {
    observe: jest.fn(),
    activeWorkplaceId: 'active-wp',
    setActiveWorkplaceId: jest.fn(),
    setOnboardingCompleted: jest.fn(),
  },
}));

jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    ensureDefaultWorkplace: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/src/services/reactive/evictWorkplaceReactiveCaches', () => ({
  evictWorkplaceReactiveCaches: jest.fn(),
}));

jest.mock('@/src/services/analytics', () => ({
  analytics: { logWorkplaceSwitched: jest.fn() },
}));

jest.mock('@/src/hooks/useObservable');
jest.mock('@/src/hooks/useWorkplaceSnapshot');

jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: {
    deferCustomSnapshot: jest.fn(),
    getCustomSnapshot: jest.fn(() => null),
  },
}));

const mockUseObservable = useObservable as jest.Mock;
const mockUseWorkplaceSnapshot = useWorkplaceSnapshot as jest.Mock;

describe('WorkplaceProvider recovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (preferences as { activeWorkplaceId: string }).activeWorkplaceId = 'active-wp';
    mockUseObservable.mockReturnValue({ data: 'active-wp' });
  });

  it('does not reset when a stale not-found error names a different workplace', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({
      data: null,
      error: new Error('Workplace not found: backup-wp'),
    });

    render(
      <WorkplaceProvider>
        <Text>child</Text>
      </WorkplaceProvider>,
    );

    expect(preferences.setActiveWorkplaceId).not.toHaveBeenCalled();
    expect(preferences.setOnboardingCompleted).not.toHaveBeenCalled();
  });

  it('resets when the active workplace itself is missing', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({
      data: null,
      error: new Error('Workplace not found: active-wp'),
    });

    render(
      <WorkplaceProvider>
        <Text>child</Text>
      </WorkplaceProvider>,
    );

    expect(preferences.setActiveWorkplaceId).toHaveBeenCalledWith(undefined);
    expect(preferences.setOnboardingCompleted).toHaveBeenCalledWith(false);
  });

  it('renders children from the cached workplace id before the database row arrives', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({
      data: null,
      error: null,
    });
    (snapshotService.getCustomSnapshot as jest.Mock).mockReturnValue({
      defaultCurrencyCode: 'INR',
    });

    const { getByText } = render(
      <WorkplaceProvider>
        <Text>child</Text>
      </WorkplaceProvider>,
    );

    expect(getByText('child')).toBeTruthy();
    expect(preferences.setOnboardingCompleted).not.toHaveBeenCalled();
  });

  it('waits for the database instead of inventing a currency on a cache miss', () => {
    mockUseWorkplaceSnapshot.mockReturnValue({ data: null, error: null });
    (snapshotService.getCustomSnapshot as jest.Mock).mockReturnValue(null);

    const { queryByText } = render(
      <WorkplaceProvider>
        <Text>child</Text>
      </WorkplaceProvider>,
    );

    expect(queryByText('child')).toBeNull();
  });
});
