import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { CurrencyPreferenceView } from './CurrencyPreferenceView';

// Mock dependencies
jest.mock('react-native/Libraries/Modal/Modal', () => ({
  __esModule: true,
  default: ({ visible, children }: any) => (visible ? children : null),
}));

jest.mock('@/src/components/core', () => {
  const { View, Text, TextInput } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  return {
    AppText: ({ children, style, ...props }: any) =>
      React.createElement(Text, { ...props, style }, children),
    AppInput: ({ style, ...props }: any) => React.createElement(TextInput, { ...props, style }),
    AppIcon: ({ name, style, ...props }: any) =>
      React.createElement(View, { ...props, style, 'data-icon': name }),
  };
});

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      background: '#ffffff',
      text: '#000000',
      border: '#e0e0e0',
      surface: '#ffffff',
      primary: '#007bff',
      overlay: 'rgba(0,0,0,0.5)',
    },
  }),
}));

const mockCurrencies = [
  { code: 'USD', name: 'US Dollar', symbol: '$' } as any,
  { code: 'EUR', name: 'Euro', symbol: '€' } as any,
  { code: 'GBP', name: 'British Pound', symbol: '£' } as any,
  { code: 'AMD', name: 'Armenian Dram', symbol: '֏' } as any,
];

describe('CurrencyPreferenceView', () => {
  it('filters currencies based on search query', async () => {
    const onSelect = jest.fn();
    const { getByText, getByPlaceholderText, queryByText } = render(
      <CurrencyPreferenceView
        selectedCurrency="USD"
        currencies={mockCurrencies}
        workplaceName="Test Workplace"
        onSelect={onSelect}
      />,
    );

    // Open modal
    fireEvent.press(getByText('USD $'));

    // Verify initial list shows all
    expect(getByText('US Dollar')).toBeTruthy();
    expect(getByText('Euro')).toBeTruthy();
    expect(getByText('Armenian Dram')).toBeTruthy();

    // Search for "Euro"
    const searchInput = getByPlaceholderText('Search...');
    fireEvent.changeText(searchInput, 'Euro');

    // Verify list is filtered
    await waitFor(() => {
      expect(queryByText('US Dollar')).toBeNull();
      expect(getByText('Euro')).toBeTruthy();
      expect(queryByText('Armenian Dram')).toBeNull();
    });

    // Search for "AMD" (Code)
    fireEvent.changeText(searchInput, 'AMD');
    await waitFor(() => {
      expect(getByText('Armenian Dram')).toBeTruthy();
      expect(queryByText('Euro')).toBeNull();
    });

    // Search for "֏" (Symbol)
    fireEvent.changeText(searchInput, '֏');
    await waitFor(() => {
      expect(getByText('Armenian Dram')).toBeTruthy();
      expect(queryByText('Euro')).toBeNull();
    });
  });
});
