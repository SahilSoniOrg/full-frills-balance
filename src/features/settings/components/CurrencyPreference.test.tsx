
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { CurrencyPreference } from './CurrencyPreference';

// Mock dependencies
jest.mock('react-native/Libraries/Modal/Modal', () => ({
    __esModule: true,
    default: ({ visible, children }: any) => (visible ? children : null),
}));

jest.mock('@/src/components/core', () => {
    const React = require('react');
    const { View, Text, TextInput } = require('react-native');
    return {
        AppText: ({ children, style, ...props }: any) => React.createElement(Text, { ...props, style }, children),
        AppInput: ({ style, ...props }: any) => React.createElement(TextInput, { ...props, style }),
        AppIcon: ({ name, style, ...props }: any) => React.createElement(View, { ...props, style, 'data-icon': name }),
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

jest.mock('@/src/contexts/UIContext', () => ({
    useUI: () => ({
        defaultCurrency: 'USD',
        updateUserDetails: jest.fn(),
    }),
}));

jest.mock('@/src/hooks/use-currencies', () => ({
    useCurrencies: () => ({
        currencies: [
            { code: 'USD', name: 'US Dollar', symbol: '$' },
            { code: 'EUR', name: 'Euro', symbol: '€' },
            { code: 'GBP', name: 'British Pound', symbol: '£' },
            { code: 'AMD', name: 'Armenian Dram', symbol: '֏' },
        ],
    }),
}));

describe('CurrencyPreference', () => {
    it('filters currencies based on search query', async () => {
        const { getByText, getByPlaceholderText, queryByText } = render(<CurrencyPreference />);

        // Open modal
        fireEvent.press(getByText('USD'));

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
