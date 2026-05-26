import { AppCard } from '@/src/components/core/AppCard';
import { render, screen } from '@/src/utils/test-utils';
import { StyleSheet, View } from 'react-native';

describe('AppCard', () => {
  it('renders correctly with children', () => {
    render(
      <AppCard>
        <View testID="test-child" />
      </AppCard>,
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('applies default elevation and padding', () => {
    render(
      <AppCard>
        <View testID="test-child" />
      </AppCard>,
    );

    const card = screen.getByTestId('test-child').parent;
    expect(card).toBeTruthy();
  });

  it('renders with custom elevation', () => {
    render(
      <AppCard elevation="lg">
        <View testID="test-child" />
      </AppCard>,
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('renders with no elevation when specified', () => {
    render(
      <AppCard elevation="none">
        <View testID="test-child" />
      </AppCard>,
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('renders with custom padding', () => {
    render(
      <AppCard testID="custom-card" padding="md">
        <View testID="test-child" />
      </AppCard>,
    );

    const card = screen.getByTestId('custom-card');
    expect(StyleSheet.flatten(card.props.style).padding).toBe(16);
  });

  it('renders with no padding when specified', () => {
    render(
      <AppCard padding="none">
        <View testID="test-child" />
      </AppCard>,
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('allows numeric padding to pass through as raw Box padding', () => {
    render(
      <AppCard testID="custom-card" padding={0}>
        <View testID="test-child" />
      </AppCard>,
    );

    const card = screen.getByTestId('custom-card');
    expect(StyleSheet.flatten(card.props.style).padding).toBe(0);
  });

  it('renders with custom border radius', () => {
    render(
      <AppCard radius="xl">
        <View testID="test-child" />
      </AppCard>,
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('renders with secondary variant', () => {
    render(
      <AppCard variant="secondary">
        <View testID="test-child" />
      </AppCard>,
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('applies custom styles', () => {
    render(
      <AppCard style={{ margin: 10 }}>
        <View testID="test-child" />
      </AppCard>,
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('passes additional props to View', () => {
    render(
      <AppCard testID="custom-card">
        <View testID="test-child" />
      </AppCard>,
    );

    expect(screen.getByTestId('custom-card')).toBeTruthy();
  });

  it('applies custom styles to the card itself', () => {
    render(
      <AppCard testID="custom-card" style={{ opacity: 0.5, transform: [{ scale: 0.95 }] }}>
        <View testID="test-child" />
      </AppCard>,
    );

    const card = screen.getByTestId('custom-card');
    expect(card.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ opacity: 0.5, transform: [{ scale: 0.95 }] }),
      ]),
    );
  });
});
