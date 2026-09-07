import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { DeviceNameStep } from '../DeviceNameStep';
import type { ReactNode } from 'react';

jest.mock('@/src/components/core', () => {
  const { Text, TextInput, TouchableOpacity } = jest.requireActual(
    'react-native',
  ) as typeof import('react-native');
  return {
    AppButton: ({ children, ...props }: { children: ReactNode }) => (
      <TouchableOpacity {...props}>
        <Text>{children}</Text>
      </TouchableOpacity>
    ),
    AppInput: (props: Record<string, unknown>) => <TextInput {...props} />,
    AppText: ({ children, ...props }: { children: ReactNode }) => (
      <Text {...props}>{children}</Text>
    ),
  };
});

jest.mock('@/src/design-system', () => {
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  const passthrough = ({ children, ...props }: { children: ReactNode }) => (
    <View {...props}>{children}</View>
  );
  return { Box: passthrough, Stack: passthrough };
});

jest.mock('@/src/components/legal/PrivacyAcknowledgementSheet', () => {
  const { Text, TouchableOpacity } = jest.requireActual(
    'react-native',
  ) as typeof import('react-native');
  return {
    PrivacyAcknowledgementSheet: ({
      visible,
      onAcknowledge,
    }: {
      visible: boolean;
      onAcknowledge: () => void;
    }) =>
      visible ? (
        <TouchableOpacity testID="privacy-acknowledgement-sheet" onPress={onAcknowledge}>
          <Text>Acknowledge privacy</Text>
        </TouchableOpacity>
      ) : null,
  };
});

const defaultProps = {
  name: 'My device',
  setName: jest.fn(),
  onContinue: jest.fn(),
  onRestore: jest.fn(),
  onPrivacyNotice: jest.fn(),
  onAcknowledgePrivacyPolicy: jest.fn(),
  isCompleting: false,
};

describe('DeviceNameStep privacy acknowledgement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the privacy prompt after the name is provided', () => {
    render(<DeviceNameStep {...defaultProps} isPrivacyPolicyAcknowledged={false} />);

    fireEvent.press(screen.getByTestId('onboarding-continue-button'));
    expect(defaultProps.onContinue).not.toHaveBeenCalled();
    expect(screen.getByTestId('privacy-acknowledgement-sheet')).toBeTruthy();

    fireEvent.press(screen.getByTestId('privacy-acknowledgement-sheet'));
    expect(defaultProps.onAcknowledgePrivacyPolicy).toHaveBeenCalledTimes(1);
    expect(defaultProps.onContinue).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('onboarding-privacy-notice-button'));
    expect(defaultProps.onPrivacyNotice).toHaveBeenCalledTimes(1);
  });

  it('allows onboarding after the current privacy policy is acknowledged', () => {
    render(<DeviceNameStep {...defaultProps} isPrivacyPolicyAcknowledged />);

    fireEvent.press(screen.getByTestId('onboarding-continue-button'));
    expect(defaultProps.onContinue).toHaveBeenCalledTimes(1);
  });
});
