import { useAppRestart } from '@/src/contexts/app-shell/AppRestartProvider';
import { RestartRequiredScreen } from '@/src/features/dev';
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

/** Composer / form sheets — match journal-entry bottom-slide language. */
const COMPOSER_SHEET = {
  headerShown: false,
  presentation: 'card' as const,
  animation: 'slide_from_bottom' as const,
  gestureEnabled: true,
  gestureDirection: 'vertical' as const,
};

/** Detail / settings pushes — explicit horizontal slide for consistency. */
const DETAIL_PUSH = {
  headerShown: false,
  animation: 'slide_from_right' as const,
};

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
      <Stack.Screen name="journal-entry" options={COMPOSER_SHEET} />
      <Stack.Screen name="onboarding" options={COMPOSER_SHEET} />
      <Stack.Screen name="account-creation" options={COMPOSER_SHEET} />
      <Stack.Screen name="category-creation" options={COMPOSER_SHEET} />
      <Stack.Screen name="planned-payment-form" options={COMPOSER_SHEET} />
      <Stack.Screen name="budget-edit" options={COMPOSER_SHEET} />
      <Stack.Screen name="sms-rule-form" options={COMPOSER_SHEET} />
      <Stack.Screen name="import-selection" options={COMPOSER_SHEET} />
      <Stack.Screen
        name="account-management"
        options={{
          ...DETAIL_PUSH,
          headerBackButtonMenuEnabled: false,
        }}
      />
      <Stack.Screen name="_design-preview" options={{ headerShown: false }} />
      <Stack.Screen name="account-details" options={DETAIL_PUSH} />
      <Stack.Screen name="journal-details" options={DETAIL_PUSH} />
      <Stack.Screen name="planned-payment-details" options={DETAIL_PUSH} />
      <Stack.Screen name="budget-details" options={DETAIL_PUSH} />
      <Stack.Screen name="insight-details" options={DETAIL_PUSH} />
      <Stack.Screen name="hub" options={DETAIL_PUSH} />
      <Stack.Screen name="reports" options={DETAIL_PUSH} />
      <Stack.Screen name="reports-v2" options={DETAIL_PUSH} />
      <Stack.Screen name="journal-search" options={DETAIL_PUSH} />
      <Stack.Screen name="sms-inbox" options={DETAIL_PUSH} />
      <Stack.Screen name="sms-rules" options={DETAIL_PUSH} />
      <Stack.Screen name="workplace-settings" options={DETAIL_PUSH} />
      <Stack.Screen name="device-settings" options={DETAIL_PUSH} />
      <Stack.Screen name="personalization-settings" options={DETAIL_PUSH} />
      <Stack.Screen name="data-management-settings" options={DETAIL_PUSH} />
      <Stack.Screen name="audit-log" options={DETAIL_PUSH} />
      <Stack.Screen name="privacy-security-settings" options={DETAIL_PUSH} />
      <Stack.Screen name="privacy-notice" options={DETAIL_PUSH} />
      <Stack.Screen name="current-workplace-settings" options={DETAIL_PUSH} />
      <Stack.Screen name="automation-settings" options={DETAIL_PUSH} />
      <Stack.Screen name="maintenance-settings" options={DETAIL_PUSH} />
      <Stack.Screen name="about-support-settings" options={DETAIL_PUSH} />
      <Stack.Screen name="appearance-settings" options={DETAIL_PUSH} />
    </Stack>
  );
}
