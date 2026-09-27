import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { Keyboard } from 'react-native';
import { WelcomeScene } from '../welcome';

jest.mock('@/src/components/core', () => {
  const {
    Text: NativeText,
    TextInput: NativeTextInput,
    TouchableOpacity,
    View,
  } = jest.requireActual('react-native') as typeof import('react-native');

  return {
    AppButton: ({ children, ...props }: { children?: React.ReactNode }) => (
      <TouchableOpacity {...props}>{children}</TouchableOpacity>
    ),
    AppInput: ({ label, ...props }: { label?: string }) => (
      <View>
        {label ? <NativeText>{label}</NativeText> : null}
        <NativeTextInput {...props} />
      </View>
    ),
    AppText: ({ children, ...props }: { children?: React.ReactNode }) => (
      <NativeText {...props}>{children}</NativeText>
    ),
  };
});

jest.mock('@/src/components/legal/PrivacyAcknowledgementSheet', () => ({
  PrivacyAcknowledgementSheet: () => null,
}));

jest.mock('@/src/design-system', () => {
  const { View: NativeView } = jest.requireActual('react-native') as typeof import('react-native');
  const passthrough = ({ children, ...props }: { children?: React.ReactNode }) => (
    <NativeView {...props}>{children}</NativeView>
  );

  return {
    Box: passthrough,
    Stack: passthrough,
  };
});

const makeProps = (overrides: Partial<React.ComponentProps<typeof WelcomeScene>> = {}) => ({
  name: '',
  onNameChange: jest.fn(),
  privacyAcknowledged: true,
  onAcknowledgePrivacy: jest.fn(),
  onPrivacyNotice: jest.fn(),
  onStart: jest.fn(),
  onRestore: jest.fn(),
  ...overrides,
});

describe('WelcomeScene responsive composition', () => {
  beforeEach(() => {
    jest.spyOn(Keyboard, 'addListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the complete welcome page as one composition', () => {
    render(<WelcomeScene {...makeProps()} />);

    expect(screen.getByTestId('onboarding-welcome-hero')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-name-input')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-start')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-welcome-trust-actions')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-restore-button')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-privacy-notice-button')).toBeOnTheScreen();
  });

  it('keeps every page element mounted when the name field is focused', () => {
    render(<WelcomeScene {...makeProps()} />);
    const input = screen.getByTestId('onboarding-name-input');

    fireEvent(input, 'focus');

    expect(screen.getByTestId('onboarding-welcome-hero')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-start')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-welcome-trust-actions')).toBeOnTheScreen();
  });

  it('uses the same validated start path for keyboard submit and the primary button', () => {
    const onStart = jest.fn();
    render(<WelcomeScene {...makeProps({ name: 'Molly', onStart })} />);

    fireEvent(screen.getByTestId('onboarding-name-input'), 'submitEditing');

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('does not advance when keyboard submit has no name', () => {
    const onStart = jest.fn();
    render(<WelcomeScene {...makeProps({ onStart })} />);

    fireEvent(screen.getByTestId('onboarding-name-input'), 'submitEditing');

    expect(onStart).not.toHaveBeenCalled();
  });
});
