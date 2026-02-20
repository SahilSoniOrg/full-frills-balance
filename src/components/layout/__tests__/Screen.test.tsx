import { Screen } from '@/src/components/layout/Screen';
import { render, screen } from '@/src/utils/test-utils';
import React from 'react';
import { ScrollView } from 'react-native';

// Mock NavigationBar to avoid testing it here
jest.mock('@/src/components/layout/NavigationBar', () => ({
  NavigationBar: ({ title, subtitle, showBack, rightActions }: any) => (
    <MockView testID="navigation-bar">
      <MockView testID="nav-title">{title}</MockView>
      <MockView testID="nav-subtitle">{subtitle}</MockView>
      <MockView testID="nav-back">{showBack ? 'back' : 'no-back'}</MockView>
      <MockView testID="nav-actions">{rightActions ? 'actions' : 'no-actions'}</MockView>
    </MockView>
  ),
}));

// Mock View component
const MockView = ({ children, testID, ...props }: any) => React.createElement('mock-view', { testID, ...props }, children);

describe('Screen', () => {
  it('renders correctly with children', () => {
    render(
      <Screen>
        <MockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('renders with title and shows NavigationBar', () => {
    render(
      <Screen title="Test Screen">
        <MockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('navigation-bar')).toBeTruthy();
    expect(screen.getByTestId('nav-title')).toHaveTextContent('Test Screen');
  });

  it('renders with title and subtitle', () => {
    render(
      <Screen title="Test Screen" subtitle="Test Subtitle">
        <MockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('nav-title')).toHaveTextContent('Test Screen');
    expect(screen.getByTestId('nav-subtitle')).toHaveTextContent('Test Subtitle');
  });

  it('renders with back button', () => {
    render(
      <Screen title="Test Screen" showBack>
        <MockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('nav-back')).toHaveTextContent('back');
  });

  it('renders with header actions', () => {
    const TestActions = () => <MockView testID="test-actions" />;

    render(
      <Screen title="Test Screen" headerActions={<TestActions />}>
        <MockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('nav-actions')).toHaveTextContent('actions');
  });


  it('renders non-scrollable content when scrollable is false', () => {
    render(
      <Screen scrollable={false}>
        <MockView testID="test-child" />
      </Screen>
    );

    expect(() => screen.UNSAFE_root.findByType(ScrollView)).toThrow();
  });

  it('applies padding when withPadding is true', () => {
    render(
      <Screen withPadding>
        <MockView testID="test-child" />
      </Screen>
    );

    const child = screen.getByTestId('test-child');
    // The parent of host element 'mock-view' is the MockView component
    // The parent of MockView is the View from Screen component
    const parent = child.parent?.parent;

    // Check if the parent has padding styles
    expect(parent?.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          paddingHorizontal: expect.any(Number),
        }),
      ])
    );
  });

  it('applies custom styles', () => {
    render(
      <Screen style={{ backgroundColor: 'red' }}>
        <MockView testID="test-child" />
      </Screen>
    );

    const child = screen.getByTestId('test-child');
    const parent = child.parent?.parent;

    expect(parent?.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: 'red' }),
      ])
    );
  });

  it('passes additional props to SafeAreaView', () => {
    render(
      <Screen testID="custom-screen">
        <MockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('custom-screen')).toBeTruthy();
  });

  it('renders without title (no NavigationBar)', () => {
    render(
      <Screen>
        <MockView testID="test-child" />
      </Screen>
    );

    expect(() => screen.getByTestId('navigation-bar')).toThrow();
  });
});
