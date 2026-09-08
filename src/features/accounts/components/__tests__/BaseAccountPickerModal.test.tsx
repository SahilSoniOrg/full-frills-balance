import { BaseAccountPickerModal } from '@/src/components/account-selection/BaseAccountPickerModal';
import { fireEvent, render } from '@/src/utils/test-utils';
import React from 'react';
import { Text } from 'react-native';

jest.mock('react-native/Libraries/Modal/Modal', () => ({
  __esModule: true,
  default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? children : null,
}));

jest.mock('@/src/components/core', () => {
  const mockReactNative = jest.requireActual('react-native');
  const mockReact = jest.requireActual('react');
  return {
    AppText: ({ children, ...props }: { children: React.ReactNode }) =>
      mockReact.createElement(mockReactNative.Text, props, children),
    AppIcon: () => null,
  };
});

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      background: '#ffffff',
      overlay: 'rgba(0, 0, 0, 0.5)',
      textSecondary: '#666666',
    },
  }),
}));

describe('BaseAccountPickerModal', () => {
  it('keeps sheet touches separate from the backdrop close target', () => {
    const onClose = jest.fn();

    const { getByTestId } = render(
      <BaseAccountPickerModal visible title="Select Account" onClose={onClose}>
        <Text>Account pills</Text>
      </BaseAccountPickerModal>,
    );

    fireEvent.press(getByTestId('account-picker-modal-content'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('account-picker-modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
