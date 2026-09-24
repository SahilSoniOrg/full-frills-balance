import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { Keyboard } from 'react-native';
import { OnboardingScreen } from '../OnboardingScreen';

jest.mock('@/src/components/core', () => {
  const { Text: NativeText } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    AppText: ({ children, ...props }: { children?: React.ReactNode }) => (
      <NativeText {...props}>{children}</NativeText>
    ),
    LoadingView: () => null,
  };
});

jest.mock('@/src/components/shared/MoneyText', () => {
  const { Text: NativeText } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    MoneyText: ({ amount, ...props }: { amount: number }) => (
      <NativeText {...props}>{amount}</NativeText>
    ),
  };
});

jest.mock('@/src/features/setup', () => ({ startFirstRunRestoreFromDeviceName: jest.fn() }));
jest.mock('@/src/services/analytics', () => ({
  analytics: { logPrivacyPolicyAcknowledged: jest.fn() },
}));
jest.mock('@/src/services/legal/privacyPolicyAcceptance', () => ({
  acknowledgeCurrentPrivacyPolicy: jest.fn(),
  hasAcknowledgedCurrentPrivacyPolicy: () => true,
  subscribeToPrivacyPolicyAcknowledgement: () => () => {},
}));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: {
    back: jest.fn(),
    toDashboard: jest.fn(),
    toPrivacyNotice: jest.fn(),
    toSetupJourney: jest.fn(),
  },
}));
jest.mock('@/src/utils/alerts', () => ({ toast: { error: jest.fn() } }));
jest.mock('../commitCashClarity', () => ({ commitCashClarity: jest.fn() }));

jest.mock('../scenes', () => {
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  const button = (testID: string, onPress: () => void) => (
    <Pressable testID={testID} onPress={onPress} />
  );
  return {
    WelcomeScene: ({
      onNameChange,
      onStart,
    }: {
      onNameChange: (name: string) => void;
      onStart: () => void;
    }) => (
      <>
        {button('name', () => onNameChange('Molly'))}
        {button('start', onStart)}
      </>
    ),
    CurrencyScene: ({ onContinue }: { onContinue: () => void }) =>
      button('currency-continue', onContinue),
    MoneyScene: ({
      onAccountsChange,
      onContinue,
    }: {
      onAccountsChange: (accounts: unknown[]) => void;
      onContinue: (heard: string) => void;
    }) => (
      <>
        {button('add-account', () =>
          onAccountsChange([{ id: 'bank-1', kind: 'bank', name: 'Bank', balance: 500 }]),
        )}
        {button('money-continue', () => onContinue('Got your money'))}
      </>
    ),
    IncomeScene: ({ onBack }: { onBack: () => void }) => button('income-back', onBack),
    ProtectScene: () => null,
    ReserveScene: () => null,
    ClarityScene: () => null,
  };
});

describe('OnboardingScreen Safe-to-Spend note', () => {
  beforeEach(() => {
    jest.spyOn(Keyboard, 'addListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows each step its own echo instead of the previous step’s draft change', () => {
    render(<OnboardingScreen />);

    fireEvent.press(screen.getByTestId('name'));
    fireEvent.press(screen.getByTestId('start'));
    fireEvent.press(screen.getByTestId('currency-continue'));
    expect(screen.getByTestId('onboarding-sts-change')).toHaveTextContent('We’ll call you Molly.');

    fireEvent.press(screen.getByTestId('add-account'));
    expect(screen.getByTestId('onboarding-sts-change')).toHaveTextContent(/Bank added/);

    fireEvent.press(screen.getByTestId('money-continue'));
    expect(screen.getByTestId('onboarding-sts-change')).toHaveTextContent('Got your money');

    fireEvent.press(screen.getByTestId('income-back'));
    expect(screen.queryByTestId('onboarding-sts-change')).toBeNull();
  });
});
