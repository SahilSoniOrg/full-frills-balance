import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { IconButton } from '@/src/components/core';
import { PrivacyToggleButton } from '../PrivacyToggleButton';
import { PrivacyScopeProvider } from '@/src/contexts/PrivacyScope';
import { preferences } from '@/src/services/preferences';
import { toast } from '@/src/utils/alerts';

jest.mock('@/src/utils/alerts', () => ({ toast: { info: jest.fn() } }));

beforeEach(() => {
  preferences.privacy.setIsPrivacyMode(false);
  jest.clearAllMocks();
});

it.each([false, true])(
  'highlights only a page override and restores the neutral color (%s)',
  globalPrivacyMode => {
    preferences.privacy.setIsPrivacyMode(globalPrivacyMode);
    render(<PrivacyToggleButton iconColor="#123456" />);
    const color = () => screen.UNSAFE_getByType(IconButton).props.iconColor;
    expect(color()).toBe('#123456');
    fireEvent.press(screen.getByTestId('privacy-toggle'));
    expect(color()).not.toBe('#123456');
    expect(screen.getByTestId('privacy-toggle').props.accessibilityLabel).toBe(
      globalPrivacyMode ? 'Hide balances' : 'Show balances',
    );
    expect(preferences.privacy.isPrivacyMode).toBe(globalPrivacyMode);
    fireEvent.press(screen.getByTestId('privacy-toggle'));
    expect(color()).toBe('#123456');
  },
);

it('explains privacy on long press without toggling it', () => {
  render(<PrivacyToggleButton />);
  fireEvent(screen.getByTestId('privacy-toggle'), 'longPress');
  expect(toast.info).toHaveBeenLastCalledWith(
    'Balances are visible on this page. Using your privacy preference. Tap to change visibility on this page only.',
    { key: 'privacy-help' },
  );
  expect(screen.getByTestId('privacy-toggle').props.accessibilityLabel).toBe('Hide balances');
  fireEvent.press(screen.getByTestId('privacy-toggle'));
  fireEvent(screen.getByTestId('privacy-toggle'), 'longPress');
  expect(toast.info).toHaveBeenLastCalledWith(
    'Balances are hidden on this page. This page differs from your privacy preference. Tap to change visibility on this page only.',
    { key: 'privacy-help' },
  );
});

it('keeps overrides isolated between pages', () => {
  render(
    <>
      <PrivacyScopeProvider>
        <PrivacyToggleButton testID="first-page" />
      </PrivacyScopeProvider>
      <PrivacyScopeProvider>
        <PrivacyToggleButton testID="second-page" />
      </PrivacyScopeProvider>
    </>,
  );
  fireEvent.press(screen.getByTestId('first-page'));
  expect(screen.getByTestId('first-page').props.accessibilityLabel).toBe('Show balances');
  expect(screen.getByTestId('second-page').props.accessibilityLabel).toBe('Hide balances');
  expect(preferences.privacy.isPrivacyMode).toBe(false);
});
