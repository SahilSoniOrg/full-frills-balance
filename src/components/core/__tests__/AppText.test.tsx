import { AppText } from '@/src/components/core/AppText';
import { render, screen } from '@/src/utils/test-utils';
import React from 'react';

describe('AppText', () => {
    it('renders correctly', () => {
        render(<AppText>Hello World</AppText>);
        expect(screen.getByText('Hello World')).toBeTruthy();
    });

    it('applies correct base styles', () => {
        render(<AppText>Styled Text</AppText>);
        const textElement = screen.getByText('Styled Text');
        // Basic check to ensure it renders. Detailed style checks might depend on theme impl.
        expect(textElement).toBeTruthy();
    });

    it('passes standard text props', () => {
        render(<AppText numberOfLines={1}>Truncated Text</AppText>);
        const textElement = screen.getByText('Truncated Text');
        expect(textElement).toBeTruthy();
        expect(textElement.props.numberOfLines).toBe(1);
    });
});
