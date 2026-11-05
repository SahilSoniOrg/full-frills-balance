import { render, screen } from '@testing-library/react-native';
import { AppConfig } from '@/src/constants/app-config';
import AccountMatcherManagementScreen from '../AccountMatcherManagementScreen';

let mockPrivacyMode = false;

jest.mock('@/src/hooks/usePrivacyPrefs', () => ({
  usePrivacyPrefs: () => ({ isPrivacyMode: mockPrivacyMode }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ accountId: 'matcher-account' }),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'matcher-workplace' }),
}));
jest.mock('@/src/hooks/useAccounts', () => ({
  useAccounts: () => ({
    accounts: [{ id: 'matcher-account', name: 'Checking', accountType: 'ASSET' }],
    isLoading: false,
    error: null,
  }),
}));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { back: jest.fn() } }));
jest.mock('@/src/components/core/AppText', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AppText: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(Text, props, children),
  };
});
jest.mock('@/src/components/core', () => ({
  AppText: jest.requireMock<typeof import('@/src/components/core/AppText')>(
    '@/src/components/core/AppText',
  ).AppText,
  Icon: { Back: 'back' },
}));
jest.mock('@/src/components/layout/ScreenWithChrome', () => ({
  ScreenWithChrome: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/src/navigation/WorkplaceBoundScreen', () => ({
  WorkplaceBoundScreen: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../components/AccountMatchersSection', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { MoneyText } = jest.requireActual<typeof import('@/src/components/shared/MoneyText')>(
    '@/src/components/shared/MoneyText',
  );
  return {
    AccountMatchersSection: () =>
      ReactModule.createElement(MoneyText, {
        amount: 12.5,
        currencyCode: 'USD',
        testID: 'matched-sms-amount',
      }),
  };
});

describe('account matcher management privacy boundary', () => {
  beforeEach(() => {
    mockPrivacyMode = false;
  });

  it('provides its own privacy scope to matched SMS amounts without an ancestor provider', () => {
    // Deliberately use the raw renderer: the shared test renderer supplies a scope
    // that would hide the missing route-level boundary seen on the simulator.
    render(<AccountMatcherManagementScreen />);
    expect(screen.getByTestId('matched-sms-amount').props.children).not.toBe(AppConfig.privacyMask);
  });

  it('masks matched SMS amounts when global privacy is enabled', () => {
    mockPrivacyMode = true;
    render(<AccountMatcherManagementScreen />);
    expect(screen.getByTestId('matched-sms-amount').props.children).toBe(AppConfig.privacyMask);
  });
});
