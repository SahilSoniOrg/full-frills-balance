/* eslint-disable @typescript-eslint/no-require-imports */
import { WorkplaceSwitcher } from '@/src/components/common/WorkplaceSwitcher';
import { render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/components/core', () => {
  const React = require('react');
  const { Text: MockText } = require('react-native');
  return {
    AppIcon: () => null,
    AppText: ({ children, ...props }: any) => React.createElement(MockText, props, children),
  };
});

const mockSetWorkplaceId = jest.fn().mockResolvedValue(undefined);

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useOptionalWorkplace: () => ({ workplaceId: 'wp-1', setWorkplaceId: mockSetWorkplaceId }),
}));

jest.mock('@/src/hooks/useWorkplaceSnapshot', () => ({
  useWorkplaceSnapshot: () => ({ data: { id: 'wp-1', name: 'Household' } }),
}));

jest.mock('@/src/hooks/useObservable', () => ({
  useObservable: () => ({
    data: [
      { id: 'wp-2', name: 'Business' },
      { id: 'wp-1', name: 'Household' },
    ],
  }),
}));

jest.mock('@/src/components/common/SelectionPickerSheet', () => ({
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
              React.createElement(MockText, null, option.label),
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
});
