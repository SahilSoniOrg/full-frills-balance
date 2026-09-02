/* eslint-disable @typescript-eslint/no-require-imports */
import { SafeToSpendPreferenceView } from '@/src/features/settings/components/SafeToSpendPreferenceView';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/components/core', () => {
  const actual = jest.requireActual('@/src/components/core');
  const React = require('react');
  const { Pressable: MockPressable } = require('react-native');

  return {
    ...actual,
    AppSegmentedControl: ({ options, onChange }: any) =>
      React.createElement(
        React.Fragment,
        null,
        options.map((option: any) =>
          React.createElement(
            MockPressable,
            {
              key: option.id,
              onPress: () => onChange(option.id),
              accessibilityLabel: option.label,
            },
            option.label,
          ),
        ),
      ),
  };
});

describe('SafeToSpendPreferenceView', () => {
  it('offers and persists the 90-day workplace-scoped horizon', () => {
    const onChange = jest.fn();

    render(<SafeToSpendPreferenceView days={60} workplaceName="Household" onChange={onChange} />);

    expect(screen.getByText('Saved for Household only.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('90 Days'));

    expect(onChange).toHaveBeenCalledWith(90);
  });
});
