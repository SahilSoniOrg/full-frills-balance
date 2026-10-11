import { AccountReconcileDialog } from '@/src/features/accounts/components/AccountReconcileDialog';
import { AppButton } from '@/src/components/core';
import { usePrivacyScope } from '@/src/contexts/PrivacyScope';
import { preferences } from '@/src/services/preferences';
import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import type { ComponentProps } from 'react';

// Keep disabled-button behavior without requiring native opacity animations.
jest.mock('react-native/Libraries/Components/Touchable/TouchableOpacity', () => ({
  __esModule: true,
  default: jest.requireActual('react-native').Pressable,
}));

jest.mock('@/src/components/overlays/ModalSurface', () => {
  const { Text, View } = jest.requireActual('react-native');
  return {
    ModalSurface: ({
      visible,
      title,
      children,
      footer,
    }: ComponentProps<typeof import('@/src/components/overlays/ModalSurface').ModalSurface>) =>
      visible ? (
        <View>
          <Text>{title}</Text>
          {children}
          {footer}
        </View>
      ) : null,
  };
});

describe('AccountReconcileDialog', () => {
  beforeEach(() => act(() => preferences.privacy.setIsPrivacyMode(false)));
  afterEach(() => act(() => preferences.privacy.setIsPrivacyMode(false)));

  it.each([0, 3])('lets users verify the balance with %i new entries', unreconciledCount => {
    const onConfirm = jest.fn();
    render(
      <AccountReconcileDialog
        visible
        onClose={jest.fn()}
        onConfirm={onConfirm}
        balanceAmount={1234}
        currencyCode="USD"
        unreconciledCount={unreconciledCount}
      />,
    );

    expect(screen.getByText(/^Balance in this app: .*1,234\.00/)).toBeTruthy();
    expect(
      screen.getByText('Confirming records that you verified this account through today.'),
    ).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('confirmation-primary-action'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('blocks confirmation while the balance is hidden and restores it when shown', () => {
    function PrivacyToggle() {
      const { togglePrivacyMode } = usePrivacyScope();
      return (
        <AppButton onPress={togglePrivacyMode} testID="test-privacy-toggle">
          Toggle privacy
        </AppButton>
      );
    }
    const onConfirm = jest.fn();
    render(
      <>
        <PrivacyToggle />
        <AccountReconcileDialog
          visible
          onClose={jest.fn()}
          onConfirm={onConfirm}
          balanceAmount={1234}
          currencyCode="USD"
          unreconciledCount={0}
        />
      </>,
    );

    fireEvent.press(screen.getByTestId('test-privacy-toggle'));
    expect(screen.queryByText(/1,234\.00/)).toBeNull();
    expect(screen.getByText('Show amounts before confirming your balance.')).toBeTruthy();
    expect(screen.getByTestId('confirmation-primary-action')).toBeDisabled();
    fireEvent.press(screen.getByTestId('confirmation-primary-action'));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('test-privacy-toggle'));
    expect(screen.getByText(/^Balance in this app: .*1,234\.00/)).toBeTruthy();
    expect(screen.getByTestId('confirmation-primary-action')).toBeEnabled();
    fireEvent.press(screen.getByTestId('confirmation-primary-action'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
