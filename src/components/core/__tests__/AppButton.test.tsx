import { AppButton } from '@/src/components/core/AppButton';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import React from 'react';

describe('AppButton', () => {
    it('renders with title', () => {
        render(<AppButton onPress={() => { }}>Click Me</AppButton>);
        expect(screen.getByText('Click Me')).toBeTruthy();
    });

    it('calls onPress when pressed', () => {
        const onPressMock = jest.fn();
        render(<AppButton onPress={onPressMock}>Press</AppButton>);

        const button = screen.getByText('Press');
        fireEvent.press(button);

        expect(onPressMock).toHaveBeenCalledTimes(1);
    });

    it('does not call onPress when disabled', () => {
        const onPressMock = jest.fn();
        render(<AppButton onPress={onPressMock} disabled>Disabled</AppButton>);

        const button = screen.getByText('Disabled');
        fireEvent.press(button);

        expect(onPressMock).not.toHaveBeenCalled();
    });

    it('shows loading indicator when loading', () => {
        render(<AppButton onPress={() => { }} loading>Loading</AppButton>);

        // Text should not be visible when loading is true
        expect(screen.queryByText('Loading')).toBeNull();
    });

    it('renders different variants without error', () => {
        const { rerender } = render(<AppButton onPress={() => { }} variant="primary">Primary</AppButton>);
        expect(screen.getByText('Primary')).toBeTruthy();

        rerender(<AppButton onPress={() => { }} variant="secondary">Secondary</AppButton>);
        expect(screen.getByText('Secondary')).toBeTruthy();

        rerender(<AppButton onPress={() => { }} variant="ghost">Ghost</AppButton>);
        expect(screen.getByText('Ghost')).toBeTruthy();

        rerender(<AppButton onPress={() => { }} variant="outline">Outline</AppButton>);
        expect(screen.getByText('Outline')).toBeTruthy();
    });

    it('renders different sizes without error', () => {
        const { rerender } = render(<AppButton onPress={() => { }} size="sm">Small</AppButton>);
        expect(screen.getByText('Small')).toBeTruthy();

        rerender(<AppButton onPress={() => { }} size="md">Medium</AppButton>);
        expect(screen.getByText('Medium')).toBeTruthy();

        rerender(<AppButton onPress={() => { }} size="lg">Large</AppButton>);
        expect(screen.getByText('Large')).toBeTruthy();
    });

    it('passes testID to component', () => {
        render(<AppButton onPress={() => { }} testID="custom-button">Test</AppButton>);
        expect(screen.getByTestId('custom-button')).toBeTruthy();
    });
});
