import SimpleModal from '@/src/components/common/SimpleModal';
import { render, screen } from '@/src/utils/test-utils';
import React from 'react';

// Mock expo-router Link
jest.mock('expo-router', () => {
  const React = require('react');
  const RN = require('react-native');
  return {
    Link: ({ children, href, ...props }: any) =>
      React.createElement(RN.TouchableOpacity, { testID: 'expo-link', ...props }, children),
  };
});

// Mock core components
jest.mock('@/src/components/core', () => {
  const React = require('react');
  const RN = require('react-native');
  return {
    AppButton: ({ children, variant, ...props }: any) =>
      React.createElement(RN.TouchableOpacity, { testID: `app-button-${variant}`, ...props }, children),
    AppCard: ({ children, elevation, padding, ...props }: any) =>
      React.createElement(RN.View, { testID: 'app-card', ...props }, children),
    AppText: ({ children, variant, style, ...props }: any) =>
      React.createElement(RN.Text, { testID: `app-text-${variant}`, style, ...props }, children),
  };
});

describe('SimpleModal', () => {
  it('renders correctly', () => {
    render(<SimpleModal />);

    expect(screen.getByText('This is a modal')).toBeTruthy();
    expect(screen.getByTestId('app-card')).toBeTruthy();
    expect(screen.getByTestId('app-button-outline')).toBeTruthy();
  });

  it('renders with correct title', () => {
    render(<SimpleModal />);

    expect(screen.getByText('This is a modal')).toBeTruthy();
    expect(screen.getByTestId('app-text-heading')).toBeTruthy();
  });

  it('renders with correct button variant', () => {
    render(<SimpleModal />);

    expect(screen.getByTestId('app-button-outline')).toBeTruthy();
  });

  it('renders with link wrapper', () => {
    render(<SimpleModal />);

    const link = screen.getByTestId('expo-link');
    expect(link).toBeTruthy();
  });
});
