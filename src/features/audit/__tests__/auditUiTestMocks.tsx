import type { PropsWithChildren } from 'react';

jest.mock('@/src/components/core', () => ({
  AppText: ({ children }: PropsWithChildren) => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>{children}</Text>;
  },
  AppIcon: () => null,
  Icon: {},
}));
jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      surfaceSecondary: '#fff',
      divider: '#ddd',
      success: '#0f0',
      error: '#f00',
      textSecondary: '#777',
    },
  }),
}));
jest.mock('@/src/hooks/useHourCyclePrefs', () => ({
  useHourCyclePrefs: () => ({ resolvedHourCycle: '24h' }),
}));
