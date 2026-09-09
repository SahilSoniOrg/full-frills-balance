import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { CurrencySelector } from '@/src/features/accounts/components/CurrencySelector';

jest.mock('react-native/Libraries/Modal/Modal', () => ({
  __esModule: true,
  default: ({ visible, children }: any) => (visible ? children : null),
}));

jest.mock('@/src/components/core', () => {
  const { View, Text, TextInput } = jest.requireActual('react-native');
  const React = jest.requireActual('react');
  const { Icon: mockIcon } = jest.requireActual('@/src/types/domainIcons');
  return {
    AppText: ({ children, style, ...props }: any) =>
      React.createElement(Text, { ...props, style }, children),
    AppInput: ({ style, ...props }: any) => React.createElement(TextInput, { ...props, style }),
    AppIcon: ({ name, style, ...props }: any) =>
      React.createElement(View, { ...props, style, 'data-icon': name }),
    isValidIconName: () => false,
    Icon: mockIcon,
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

describe('CurrencySelector', () => {
  it('filters currencies based on search query', async () => {
    const { getByText, getByPlaceholderText, queryByText } = render(
      <CurrencySelector
        selectedCurrency="USD"
        currencies={mockCurrencies}
        onSelect={jest.fn()}
        variant="pill"
      />,
    );

    fireEvent.press(getByText('USD $'));

    expect(getByText('US Dollar')).toBeTruthy();
    expect(getByText('Euro')).toBeTruthy();
    expect(getByText('Armenian Dram')).toBeTruthy();

    const searchInput = getByPlaceholderText(/Search/i);
    fireEvent.changeText(searchInput, 'Euro');

    await waitFor(() => {
      expect(queryByText('US Dollar')).toBeNull();
      expect(getByText('Euro')).toBeTruthy();
      expect(queryByText('Armenian Dram')).toBeNull();
    });

    fireEvent.changeText(searchInput, 'AMD');
    await waitFor(() => {
      expect(getByText('Armenian Dram')).toBeTruthy();
      expect(queryByText('Euro')).toBeNull();
    });

    fireEvent.changeText(searchInput, '֏');
    await waitFor(() => {
      expect(getByText('Armenian Dram')).toBeTruthy();
      expect(queryByText('Euro')).toBeNull();
    });
  });
});
