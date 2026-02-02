import { EmptyState } from '@/src/components/common/EmptyState';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import React from 'react';

// Mock AppIcon to avoid testing it here
jest.mock('@/src/components/core', () => {
  const React = require('react');
  const RN = require('react-native');
  return {
    AppIcon: ({ name, size, color, style }: any) =>
      React.createElement(RN.View, { testID: `app-icon-${name}`, style }, null),
    AppButton: ({ children, onPress, variant, style }: any) =>
      React.createElement(RN.TouchableOpacity, { testID: 'app-button', style, onPress }, children),
    AppText: ({ children, variant, color, style }: any) =>
      React.createElement(RN.Text, { testID: `app-text-${variant}`, style }, children),
  };
});

describe('EmptyState', () => {
  it('renders correctly with title', () => {
    render(<EmptyState title="No data available" />);

    expect(screen.getByText('No data available')).toBeTruthy();
    expect(screen.getByTestId('app-icon-folderOpen')).toBeTruthy();
  });

  it('renders with custom icon', () => {
    render(<EmptyState title="No data" icon="search" />);

    expect(screen.getByTestId('app-icon-search')).toBeTruthy();
  });

  it('renders with subtitle', () => {
    render(
      <EmptyState
        title="No data"
        subtitle="Try adding some items to get started"
      />
    );

    expect(screen.getByText('No data')).toBeTruthy();
    expect(screen.getByText('Try adding some items to get started')).toBeTruthy();
  });

  it('renders with action button', () => {
    const mockOnPress = jest.fn();

    render(
      <EmptyState
        title="No data"
        action={{
          label: 'Add First Item',
          onPress: mockOnPress,
        }}
      />
    );

    const button = screen.getByTestId('app-button');
    expect(button).toBeTruthy();
  });

  it('handles action button press', () => {
    const mockOnPress = jest.fn();

    render(
      <EmptyState
        title="No data"
        action={{
          label: 'Add First Item',
          onPress: mockOnPress,
        }}
      />
    );

    const button = screen.getByTestId('app-button');
    fireEvent.press(button);
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('renders without subtitle', () => {
    render(<EmptyState title="No data" />);

    expect(screen.getByText('No data')).toBeTruthy();
    expect(screen.queryByText('Try adding some items')).toBeNull();
  });

  it('renders without action button', () => {
    render(<EmptyState title="No data" />);

    expect(screen.getByText('No data')).toBeTruthy();
    expect(screen.queryByTestId('app-button')).toBeNull();
  });

  it('uses default icon when none provided', () => {
    render(<EmptyState title="No data" />);

    expect(screen.getByTestId('app-icon-folderOpen')).toBeTruthy();
  });
});
