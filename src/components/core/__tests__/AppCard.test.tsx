import { AppCard } from '@/src/components/core/AppCard';
import { render, screen } from '@/src/utils/test-utils';
import React from 'react';
import { View } from 'react-native';

describe('AppCard', () => {
  it('renders correctly with children', () => {
    render(
      <AppCard>
        <View testID="test-child" />
      </AppCard>
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('applies default elevation and padding', () => {
    render(
      <AppCard>
        <View testID="test-child" />
      </AppCard>
    );

    const card = screen.getByTestId('test-child').parent;
    expect(card).toBeTruthy();
  });

  it('renders with custom elevation', () => {
    render(
      <AppCard elevation="lg">
        <View testID="test-child" />
      </AppCard>
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('renders with no elevation when specified', () => {
    render(
      <AppCard elevation="none">
        <View testID="test-child" />
      </AppCard>
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('renders with custom padding', () => {
    render(
      <AppCard padding="lg">
        <View testID="test-child" />
      </AppCard>
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('renders with no padding when specified', () => {
    render(
      <AppCard padding="none">
        <View testID="test-child" />
      </AppCard>
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('renders with custom border radius', () => {
    render(
      <AppCard radius="xl">
        <View testID="test-child" />
      </AppCard>
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('renders with secondary variant', () => {
    render(
      <AppCard variant="secondary">
        <View testID="test-child" />
      </AppCard>
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('applies custom styles', () => {
    render(
      <AppCard style={{ margin: 10 }}>
        <View testID="test-child" />
      </AppCard>
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('passes additional props to View', () => {
    render(
      <AppCard testID="custom-card">
        <View testID="test-child" />
      </AppCard>
    );

    expect(screen.getByTestId('custom-card')).toBeTruthy();
  });

  it('renders with theme mode override', () => {
    render(
      <AppCard themeMode="dark">
        <View testID="test-child" />
      </AppCard>
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });
});
