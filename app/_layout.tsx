
import { AppText, ErrorBoundary } from '@/src/components/core';
import { UIProvider, useUI } from '@/src/contexts/UIContext';
import { useColorScheme } from '@/src/hooks/use-color-scheme';
import {
  Raleway_600SemiBold,
  Raleway_700Bold,
  Raleway_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/raleway';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { database } from '../src/data/database/Database';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    'Raleway-SemiBold': Raleway_600SemiBold,
    'Raleway-Bold': Raleway_700Bold,
    'Raleway-ExtraBold': Raleway_800ExtraBold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <DatabaseProvider database={database}>
        <UIProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <AppContent />
          </ThemeProvider>
        </UIProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { isRestartRequired, importStats: stats } = useUI();

  if (isRestartRequired) {

    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', padding: 20 }}>
        <StatusBar style="light" />
        <AppText variant="title" style={{ color: '#fff', textAlign: 'center', marginBottom: 20 }}>
          Import Successful
        </AppText>

        {stats && (
          <View style={{ marginBottom: 30, width: '100%', maxWidth: 300, backgroundColor: '#1A1A1A', padding: 20, borderRadius: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <AppText variant="body" style={{ color: '#888' }}>Accounts</AppText>
              <AppText variant="body" weight="bold" style={{ color: '#fff' }}>{stats.accounts}</AppText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <AppText variant="body" style={{ color: '#888' }}>Journals</AppText>
              <AppText variant="body" weight="bold" style={{ color: '#fff' }}>{stats.journals}</AppText>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="body" style={{ color: '#888' }}>Transactions</AppText>
              <AppText variant="body" weight="bold" style={{ color: '#fff' }}>{stats.transactions}</AppText>
            </View>

            {stats.skippedTransactions > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#333' }}>
                <AppText variant="body" style={{ color: '#FF453A' }}>Skipped</AppText>
                <AppText variant="body" weight="bold" style={{ color: '#FF453A' }}>{stats.skippedTransactions}</AppText>
              </View>
            )}
          </View>
        )}

        <AppText variant="body" style={{ color: '#fff', textAlign: 'center', opacity: 0.8 }}>
          Please completely close and restart the app to apply changes.
        </AppText>
      </View>
    );
  }

  return (
    <ErrorBoundary>
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
        <Stack.Screen name="account-reorder" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
    </ErrorBoundary>
  );
}
