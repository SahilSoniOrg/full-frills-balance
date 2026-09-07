/* eslint-disable @typescript-eslint/no-require-imports */
import { SettingsSegmentedControl } from '@/src/components/settings/SettingsSegmentedControl';
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

describe('SettingsSegmentedControl', () => {
  it('preserves numeric option values', () => {
    const onChange = jest.fn();

    render(
      <SettingsSegmentedControl
        title="Forecast horizon"
        options={[
          { id: 30, label: '30 Days' },
          { id: 90, label: '90 Days' },
        ]}
        value={30}
        onChange={onChange}
      />,
    );

    fireEvent.press(screen.getByLabelText('90 Days'));

    expect(onChange).toHaveBeenCalledWith(90);
  });
});
