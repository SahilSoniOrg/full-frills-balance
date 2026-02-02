import { AppInput } from '@/src/components/core/AppInput';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import React from 'react';

describe('AppInput', () => {
    it('renders label and placeholder', () => {
        render(<AppInput label="Username" placeholder="Enter username" />);
        expect(screen.getByText('Username')).toBeTruthy();
        expect(screen.getByPlaceholderText('Enter username')).toBeTruthy();
    });

    it('handles text input', () => {
        const onChangeText = jest.fn();
        render(<AppInput placeholder="Type here" onChangeText={onChangeText} />);

        const input = screen.getByPlaceholderText('Type here');
        fireEvent.changeText(input, 'New Text');

        expect(onChangeText).toHaveBeenCalledWith('New Text');
    });

    it('displays error message', () => {
        render(<AppInput label="Field" error="Invalid input" />);
        expect(screen.getByText('Invalid input')).toBeTruthy();
    });
});
