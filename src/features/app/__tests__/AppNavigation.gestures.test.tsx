import { render } from '@testing-library/react-native';
import { NavigationStack } from '../components/AppNavigation';

let mockReduceMotion = false;
const mockOptions = new Map<
  string,
  { animation?: string; gestureEnabled?: boolean; gestureDirection?: string }
>();

jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => mockReduceMotion }));
jest.mock('@/src/contexts/app-shell/AppRestartProvider', () => ({
  useAppRestart: () => ({ isRestartRequired: false }),
}));
jest.mock('@/src/features/dev', () => ({ RestartRequiredScreen: () => null }));
jest.mock('expo-router', () => {
  const Stack = ({ children }: { children: React.ReactNode }) => children;
  Stack.Screen = function MockStackScreen({
    name,
    options,
  }: {
    name: string;
    options: { animation?: string; gestureEnabled?: boolean; gestureDirection?: string };
  }) {
    mockOptions.set(name, options);
    return null;
  };
  return { Stack };
});

it.each([false, true])('preserves composer dismissal when reduced motion is %s', reduceMotion => {
  mockReduceMotion = reduceMotion;
  mockOptions.clear();
  render(<NavigationStack />);
  expect(mockOptions.get('journal-entry')).toMatchObject({
    gestureEnabled: true,
    gestureDirection: 'vertical',
    animation: reduceMotion ? 'none' : 'slide_from_bottom',
  });
  expect(mockOptions.get('account-management')?.animation).toBe(
    reduceMotion ? 'none' : 'slide_from_right',
  );
});
