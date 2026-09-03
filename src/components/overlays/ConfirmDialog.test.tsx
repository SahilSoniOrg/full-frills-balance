import { fireEvent, render } from '@/src/utils/test-utils';
import { ConfirmDialog } from './ConfirmDialog';

jest.mock('@/src/components/overlays/ModalSurface', () => ({
  ModalSurface: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => {
    const { View } = jest.requireActual('react-native');
    return (
      <View>
        {children}
        {footer}
      </View>
    );
  },
}));

jest.mock('@/src/components/core', () => ({
  AppButton: ({ children, ...props }: any) => {
    const React = jest.requireActual('react');
    return React.createElement('AppButton', props, children);
  },
  AppInput: (props: any) => {
    const { TextInput } = jest.requireActual('react-native');
    return <TextInput {...props} />;
  },
  AppText: ({ children, ...props }: any) => {
    const { Text } = jest.requireActual('react-native');
    return <Text {...props}>{children}</Text>;
  },
}));

describe('ConfirmDialog required confirmation', () => {
  it('enables the destructive action only for an exact name match', () => {
    const onConfirm = jest.fn();
    const { getByTestId } = render(
      <ConfirmDialog
        visible
        title="Delete workplace?"
        onClose={jest.fn()}
        requiredConfirmationValue="E2E User's Personal workplace"
        primaryAction={{ label: 'Delete workplace', onPress: onConfirm }}
        useNativeModal={false}
      />,
    );

    const input = getByTestId('confirmation-value-input');
    const action = getByTestId('confirmation-primary-action');

    expect(input.props.autoCorrect).toBe(false);
    expect(input.props.spellCheck).toBe(false);
    expect(input.props.keyboardType).toBe('ascii-capable');
    expect(action.props.disabled).toBeTruthy();

    fireEvent.changeText(input, "E2E User's Personal workplac");
    expect(action.props.disabled).toBeTruthy();

    fireEvent.changeText(input, " E2E User's Personal workplace ");
    expect(action.props.disabled).toBeFalsy();

    fireEvent.press(action);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
