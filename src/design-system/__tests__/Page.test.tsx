import { Spacing } from '@/src/constants/design-tokens';
import { Page, usePageKeyboard } from '@/src/design-system/Page';
import { render, screen } from '@/src/utils/test-utils';
import { Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useKeyboard } from '@/src/design-system/Keyboard';

jest.mock('@/src/design-system/Keyboard', () => ({
  useKeyboard: jest.fn(),
}));

const mockedUseKeyboard = jest.mocked(useKeyboard);

describe('Page safe-area ownership', () => {
  beforeEach(() => {
    jest.spyOn(Keyboard, 'addListener').mockReturnValue({ remove: jest.fn() } as never);
    mockedUseKeyboard.mockReturnValue({
      keyboardHeight: 0,
      isKeyboardVisible: false,
      dismiss: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not add the bottom inset again inside scroll content', () => {
    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 320, height: 640 },
          insets: { top: 24, left: 0, right: 0, bottom: 34 },
        }}
      >
        <Page scrollable>
          <Text>Content</Text>
        </Page>
      </SafeAreaProvider>,
    );

    const scrollView = screen.UNSAFE_getByType(ScrollView);
    expect(StyleSheet.flatten(scrollView.props.contentContainerStyle).paddingBottom).toBe(
      Spacing.xxl,
    );
  });

  it('drops the bottom safe-area edge while a keyboard-avoiding page is open', () => {
    mockedUseKeyboard.mockReturnValue({
      keyboardHeight: 320,
      isKeyboardVisible: true,
      dismiss: jest.fn(),
    });

    render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 320, height: 640 },
          insets: { top: 24, left: 0, right: 0, bottom: 34 },
        }}
      >
        <Page keyboardAvoiding>
          <Text>Content</Text>
        </Page>
      </SafeAreaProvider>,
    );

    const safeArea = screen.UNSAFE_getByType(SafeAreaView);
    expect(safeArea.props.edges).not.toContain('bottom');
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  });

  it('shares its keyboard visibility with descendants', () => {
    mockedUseKeyboard.mockReturnValue({
      keyboardHeight: 320,
      isKeyboardVisible: true,
      dismiss: jest.fn(),
    });
    const KeyboardProbe = () => (
      <Text testID="probe">{usePageKeyboard().isKeyboardVisible ? 'open' : 'closed'}</Text>
    );

    render(
      <Page keyboardAvoiding>
        <KeyboardProbe />
      </Page>,
    );

    expect(screen.getByTestId('probe')).toHaveTextContent('open');
  });
});
