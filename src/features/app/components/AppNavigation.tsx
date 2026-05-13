import { useUI } from '@/src/contexts/UIContext';
import { WorkplaceProvider, useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useAppBootstrap } from '@/src/features/app/hooks/useAppBootstrap';
import { useWidgetSync } from '@/src/features/app/hooks/useWidgetSync';
import { RestartRequiredScreen } from '@/src/features/dev';
import { Stack } from 'expo-router';
import React from 'react';

/**
 * Orchestrates the main app content based on onboarding and restart state.
 */
export function AppContent() {
  const { isRestartRequired, hasCompletedOnboarding } = useUI();

  if (isRestartRequired) {
    return <RestartRequiredScreen />;
  }

  if (!hasCompletedOnboarding) {
    return <NavigationStack />;
  }

  return (
    <WorkplaceProvider>
      <WorkplaceLoadedContent />
    </WorkplaceProvider>
  );
}

/**
 * Handles bootstrap logic once a workplace is loaded.
 */
function WorkplaceLoadedContent() {
  const { workplaceId, defaultCurrencyCode } = useWorkplace();

  // Sync app data with native widgets
  useWidgetSync(workplaceId, defaultCurrencyCode);

  // Initialize background services and data warmup
  useAppBootstrap(workplaceId, defaultCurrencyCode);

  return <NavigationStack />;
}

/**
 * The main stack definition for expo-router.
 */
export function NavigationStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="journal-entry"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen
        name="account-creation"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen
        name="onboarding"
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_bottom',
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }}
      />
      <Stack.Screen name="_design-preview" options={{ headerShown: false }} />
      <Stack.Screen name="account-details" options={{ headerShown: false }} />
      <Stack.Screen name="transaction-details" options={{ headerShown: false }} />
      <Stack.Screen
        name="account-reorder"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="manage-hierarchy"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen name="import-selection" options={{ headerShown: false }} />
      <Stack.Screen name="audit-log" options={{ headerShown: false }} />
      <Stack.Screen name="privacy-security-settings" options={{ headerShown: false }} />
      <Stack.Screen name="automation-settings" options={{ headerShown: false }} />
      <Stack.Screen name="maintenance-settings" options={{ headerShown: false }} />
      <Stack.Screen name="about-support-settings" options={{ headerShown: false }} />
      <Stack.Screen
        name="appearance-settings"
        options={{ headerShown: false, presentation: 'modal' }}
      />
    </Stack>
  );
}
