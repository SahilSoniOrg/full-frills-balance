import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { RestartRequiredScreen } from '@/src/features/dev';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { Stack } from 'expo-router';

/**
 * Orchestrates the main app content based on onboarding and restart state.
 */
export function AppContent() {
  const { isRestartRequired } = useAppRestart();

  if (isRestartRequired) {
    return <RestartRequiredScreen />;
  }

  // We render the same stack, expo-router handles the path matching
  // but we can add path-gating here if needed in the future.
  return <NavigationStack />;
}

/**
 * The main stack definition for expo-router.
 */
export function NavigationStack() {
  const reduceMotion = useReducedMotion();
  const composerOptions = {
    headerShown: false,
    presentation: 'card' as const,
    animation: reduceMotion ? ('none' as const) : ('slide_from_bottom' as const),
    gestureEnabled: !reduceMotion,
    gestureDirection: 'vertical' as const,
  };
  const detailOptions = {
    headerShown: false,
    animation: reduceMotion ? ('none' as const) : ('slide_from_right' as const),
  };

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="journal-entry" options={composerOptions} />
      <Stack.Screen name="onboarding" options={composerOptions} />
      <Stack.Screen name="account-creation" options={composerOptions} />
      <Stack.Screen name="category-creation" options={composerOptions} />
      <Stack.Screen name="planned-payment-form" options={composerOptions} />
      <Stack.Screen name="budget-edit" options={composerOptions} />
      <Stack.Screen name="sms-rule-form" options={composerOptions} />
      <Stack.Screen name="import-selection" options={composerOptions} />
      <Stack.Screen
        name="account-management"
        options={{
          ...detailOptions,
          headerBackButtonMenuEnabled: false,
        }}
      />
      <Stack.Screen name="_design-preview" options={{ headerShown: false }} />
      <Stack.Screen name="account-details" options={detailOptions} />
      <Stack.Screen name="journal-details" options={detailOptions} />
      <Stack.Screen name="planned-payment-details" options={detailOptions} />
      <Stack.Screen name="budget-details" options={detailOptions} />
      <Stack.Screen name="insight-details" options={detailOptions} />
      <Stack.Screen name="hub" options={detailOptions} />
      <Stack.Screen name="reports" options={detailOptions} />
      <Stack.Screen name="reports-v2" options={detailOptions} />
      <Stack.Screen name="journal-search" options={detailOptions} />
      <Stack.Screen name="sms-inbox" options={detailOptions} />
      <Stack.Screen name="sms-rules" options={detailOptions} />
      <Stack.Screen name="workplace-settings" options={detailOptions} />
      <Stack.Screen name="device-settings" options={detailOptions} />
      <Stack.Screen name="personalization-settings" options={detailOptions} />
      <Stack.Screen name="data-management-settings" options={detailOptions} />
      <Stack.Screen name="audit-log" options={detailOptions} />
      <Stack.Screen name="privacy-security-settings" options={detailOptions} />
      <Stack.Screen name="privacy-notice" options={detailOptions} />
      <Stack.Screen name="current-workplace-settings" options={detailOptions} />
      <Stack.Screen name="automation-settings" options={detailOptions} />
      <Stack.Screen name="maintenance-settings" options={detailOptions} />
      <Stack.Screen name="about-support-settings" options={detailOptions} />
      <Stack.Screen name="appearance-settings" options={detailOptions} />
    </Stack>
  );
}
