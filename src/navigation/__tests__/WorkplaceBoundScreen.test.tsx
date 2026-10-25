import { WorkplaceBoundScreen } from '@/src/navigation/WorkplaceBoundScreen';
import { render, screen } from '@/src/utils/test-utils';
import { Text } from 'react-native';
import { asWorkplaceId } from '@/src/types/ids';

let mockWorkplaceId = asWorkplaceId('home');
let mockRouteWorkplaceId: string | undefined = 'home';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useOptionalWorkplace: () => ({
    workplaceId: mockWorkplaceId,
    activeWorkplace: { id: mockWorkplaceId, name: 'Home' },
  }),
}));

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ workplaceId: mockRouteWorkplaceId }),
}));

jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { back: jest.fn() },
}));

describe('WorkplaceBoundScreen', () => {
  beforeEach(() => {
    mockWorkplaceId = asWorkplaceId('home');
    mockRouteWorkplaceId = 'home';
  });

  it('keeps the draft mounted and blocks interaction when the workplace changes', () => {
    const { rerender } = render(
      <WorkplaceBoundScreen>
        <Text>Draft form</Text>
      </WorkplaceBoundScreen>,
    );
    expect(screen.getByText('Draft form')).toBeTruthy();
    expect(screen.queryByText(/different workplace/i)).toBeNull();

    mockWorkplaceId = asWorkplaceId('other');
    rerender(
      <WorkplaceBoundScreen>
        <Text>Draft form</Text>
      </WorkplaceBoundScreen>,
    );
    // accessibilityViewIsModal hides siblings from the default query set.
    expect(screen.getByText('Draft form', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText(/different workplace/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close draft' })).toBeTruthy();
  });
});
