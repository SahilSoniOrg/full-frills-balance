/* eslint-disable @typescript-eslint/no-require-imports */
import { WorkplaceSwitcher } from '@/src/components/workplace/WorkplaceSwitcher';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/components/core', () => {
  const React = require('react');
  const { Text: MockText } = require('react-native');
  const { Icon: mockIcon } = require('@/src/types/domainIcons');
  return {
    AppIcon: () => null,
    AppText: ({ children, ...props }: any) => React.createElement(MockText, props, children),
    Icon: mockIcon,
  };
});

const mockSetWorkplaceId = jest.fn().mockResolvedValue(undefined);

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useOptionalWorkplace: () => ({ workplaceId: 'wp-1', setWorkplaceId: mockSetWorkplaceId }),
}));

jest.mock('@/src/hooks/useWorkplaceSnapshot', () => {
  const { Icon: mockIcon } = require('@/src/types/domainIcons');
  return {
    useWorkplaceSnapshot: () => ({
      data: { id: 'wp-1', name: 'Household', icon: mockIcon.Home },
    }),
  };
});

jest.mock('@/src/hooks/useObservable', () => {
  const { Icon: mockIcon } = require('@/src/types/domainIcons');
  return {
    useObservable: () => ({
      data: [
        { id: 'wp-2', name: 'Business', icon: mockIcon.Bank },
        { id: 'wp-1', name: 'Household', icon: mockIcon.Home },
      ],
    }),
  };
});

jest.mock('@/src/components/filters/SelectionPickerSheet', () => ({
  SelectionPickerSheet: ({ visible, options, onSelect }: any) => {
    const React = require('react');
    const { Pressable: MockPressable, Text: MockText } = require('react-native');
    return visible
      ? React.createElement(
          React.Fragment,
          null,
          options.map((option: any) =>
            React.createElement(
              MockPressable,
              { key: option.id, onPress: () => onSelect(option.id) },
              React.createElement(MockText, null, `${option.label}:${option.icon}`),
            ),
          ),
        )
      : null;
  },
}));

describe('WorkplaceSwitcher', () => {
  beforeEach(() => mockSetWorkplaceId.mockClear());

  it('displays the current workplace name instead of its storage ID', () => {
    render(<WorkplaceSwitcher />);

    expect(screen.getByLabelText('Current workplace: Household')).toBeTruthy();
  });

  it('uses each workplace icon in the switcher list', () => {
    render(<WorkplaceSwitcher />);

    fireEvent.press(screen.getByTestId('header-workplace-switcher'));

    expect(screen.getByText('Household:home')).toBeTruthy();
    expect(screen.getByText('Business:bank')).toBeTruthy();
  });
});
