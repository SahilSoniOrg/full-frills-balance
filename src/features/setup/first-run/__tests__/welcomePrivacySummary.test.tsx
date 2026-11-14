import { render, screen } from '@/src/utils/test-utils';
import { WelcomeScene } from '../welcome';

jest.mock('@/src/components/core', () => {
  const { Text: NativeText, TextInput: NativeTextInput, TouchableOpacity, View } = jest.requireActual(
    'react-native',
  ) as typeof import('react-native');
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
  return { Box: passthrough, FadeIn: passthrough, Stack: passthrough };
});

describe('WelcomeScene privacy summary', () => {
  it('shows the short privacy summary before financial input', () => {
    render(
      <WelcomeScene
        name=""
        onNameChange={jest.fn()}
        privacyAcknowledged
        onAcknowledgePrivacy={jest.fn()}
        onPrivacyNotice={jest.fn()}
        onStart={jest.fn()}
        onRestore={jest.fn()}
      />,
    );

    expect(screen.getByTestId('onboarding-privacy-summary')).toBeTruthy();
    expect(screen.getByText(/Local by default/i)).toBeTruthy();
  });
});