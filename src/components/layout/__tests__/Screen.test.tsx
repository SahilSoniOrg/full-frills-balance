import { Screen } from '@/src/components/layout/Screen';
import { render, screen } from '@/src/utils/test-utils';
import React from 'react';

// Mock NavigationBar to avoid testing it here
jest.mock('@/src/components/layout/NavigationBar', () => ({
  NavigationBar: ({ title, subtitle, onBack, showBack, backIcon, rightActions }: any) => (
    <mockView testID="navigation-bar">
      <mockView testID="nav-title">{title}</mockView>
      <mockView testID="nav-subtitle">{subtitle}</mockView>
      <mockView testID="nav-back">{showBack ? 'back' : 'no-back'}</mockView>
      <mockView testID="nav-actions">{rightActions ? 'actions' : 'no-actions'}</mockView>
    </mockView>
  ),
}));

// Mock View component
const mockView = ({ children, testID, ...props }: any) => React.createElement('mock-view', { testID, ...props }, children);

// Declare mockView as a global JSX element
declare global {
  namespace JSX {
    interface IntrinsicElements {
      mockView: any;
    }
  }
}

describe('Screen', () => {
  it('renders correctly with children', () => {
    render(
      <Screen>
        <mockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('test-child')).toBeTruthy();
  });

  it('renders with title and shows NavigationBar', () => {
    render(
      <Screen title="Test Screen">
        <mockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('navigation-bar')).toBeTruthy();
    expect(screen.getByTestId('nav-title')).toHaveTextContent('Test Screen');
  });

  it('renders with title and subtitle', () => {
    render(
      <Screen title="Test Screen" subtitle="Test Subtitle">
        <mockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('nav-title')).toHaveTextContent('Test Screen');
    expect(screen.getByTestId('nav-subtitle')).toHaveTextContent('Test Subtitle');
  });

  it('renders with back button', () => {
    render(
      <Screen title="Test Screen" showBack>
        <mockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('nav-back')).toHaveTextContent('back');
  });

  it('renders with header actions', () => {
    const TestActions = () => <mockView testID="test-actions" />;

    render(
      <Screen title="Test Screen" headerActions={<TestActions />}>
        <mockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('nav-actions')).toHaveTextContent('actions');
  });


  it('renders non-scrollable content when scrollable is false', () => {
    render(
      <Screen scrollable={false}>
        <mockView testID="test-child" />
      </Screen>
    );

    expect(() => screen.UNSAFE_root.findByType('ScrollView')).toThrow();
  });

  it('applies padding when withPadding is true', () => {
    render(
      <Screen withPadding>
        <mockView testID="test-child" />
      </Screen>
    );

    const child = screen.getByTestId('test-child');
    const parent = child.parent;

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
        <mockView testID="test-child" />
      </Screen>
    );

    const child = screen.getByTestId('test-child');
    const parent = child.parent;

    expect(parent?.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: 'red' }),
      ])
    );
  });

  it('passes additional props to SafeAreaView', () => {
    render(
      <Screen testID="custom-screen">
        <mockView testID="test-child" />
      </Screen>
    );

    expect(screen.getByTestId('custom-screen')).toBeTruthy();
  });

  it('renders without title (no NavigationBar)', () => {
    render(
      <Screen>
        <mockView testID="test-child" />
      </Screen>
    );

    expect(() => screen.getByTestId('navigation-bar')).toThrow();
  });
});
