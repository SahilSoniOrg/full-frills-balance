import 'react-native-get-random-values';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import 'react-native-reanimated';
import { UIProvider } from '../contexts/UIContext';
import { database } from '../src/data/database/Database';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <DatabaseProvider database={database}>
      <UIProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="journal-entry" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="account-creation" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="_design-preview" options={{ headerShown: false }} />
            <Stack.Screen name="account-details" options={{ headerShown: false }} />
            <Stack.Screen name="transaction-details" options={{ headerShown: false }} />
          </Stack>

          <StatusBar style="auto" />
        </ThemeProvider>
      </UIProvider>
    </DatabaseProvider>
  );
}
