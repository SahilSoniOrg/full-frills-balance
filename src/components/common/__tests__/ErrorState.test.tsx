import { ErrorState } from '@/src/components/common/ErrorState';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import React from 'react';

// Mock AppIcon and AppButton to avoid testing them here
jest.mock('@/src/components/core', () => {
  const React = require('react');
  const RN = require('react-native');
  return {
    AppIcon: ({ name, size, color, style }: any) =>
      React.createElement(RN.View, { testID: `app-icon-${name}`, style }, null),
    AppButton: ({ children, onPress, variant, style }: any) =>
      React.createElement(RN.TouchableOpacity, { testID: `app-button-${variant}`, style, onPress }, children),
    AppText: ({ children, variant, color, style }: any) =>
      React.createElement(RN.Text, { testID: `app-text-${variant}`, style }, children),
  };
});

describe('ErrorState', () => {
  it('renders with default title', () => {
    render(<ErrorState />);

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByTestId('app-icon-error')).toBeTruthy();
  });

  it('renders with custom title', () => {
    render(<ErrorState title="Network Error" />);

    expect(screen.getByText('Network Error')).toBeTruthy();
  });

  it('renders with message', () => {
    render(
      <ErrorState
        title="Network Error"
        message="Unable to connect to the server. Please check your internet connection."
      />
    );

    expect(screen.getByText('Network Error')).toBeTruthy();
    expect(screen.getByText('Unable to connect to the server. Please check your internet connection.')).toBeTruthy();
  });

  it('renders with retry button', () => {
    const mockOnRetry = jest.fn();

    render(
      <ErrorState
        title="Network Error"
        onRetry={mockOnRetry}
      />
    );

    const retryButton = screen.getByTestId('app-button-primary');
    expect(retryButton).toBeTruthy();
  });

  it('renders with go back button', () => {
    const mockOnBack = jest.fn();

    render(
      <ErrorState
        title="Network Error"
        onBack={mockOnBack}
      />
    );

    const backButton = screen.getByTestId('app-button-ghost');
    expect(backButton).toBeTruthy();
  });

  it('renders with both retry and back buttons', () => {
    const mockOnRetry = jest.fn();
    const mockOnBack = jest.fn();

    render(
      <ErrorState
        title="Network Error"
        onRetry={mockOnRetry}
        onBack={mockOnBack}
      />
    );

    expect(screen.getByTestId('app-button-primary')).toBeTruthy();
    expect(screen.getByTestId('app-button-ghost')).toBeTruthy();
  });

  it('handles retry button press', () => {
    const mockOnRetry = jest.fn();

    render(
      <ErrorState
        title="Network Error"
        onRetry={mockOnRetry}
      />
    );

    const retryButton = screen.getByTestId('app-button-primary');
    fireEvent.press(retryButton);
    expect(mockOnRetry).toHaveBeenCalledTimes(1);
  });

  it('handles back button press', () => {
    const mockOnBack = jest.fn();

    render(
      <ErrorState
        title="Network Error"
        onBack={mockOnBack}
      />
    );

    const backButton = screen.getByTestId('app-button-ghost');
    fireEvent.press(backButton);
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });

  it('renders without message', () => {
    render(<ErrorState title="Network Error" />);

    expect(screen.getByText('Network Error')).toBeTruthy();
    expect(screen.queryByText('Unable to connect')).toBeNull();
  });

  it('renders without action buttons', () => {
    render(<ErrorState title="Network Error" />);

    expect(screen.getByText('Network Error')).toBeTruthy();
    expect(screen.queryByTestId('app-button-primary')).toBeNull();
    expect(screen.queryByTestId('app-button-ghost')).toBeNull();
  });
});
