import React from 'react';
import { usePathname, useSegments } from 'expo-router';
import { analytics } from '@/src/services/analytics-service';

/**
 * Screen tracker component that listens to navigation changes and reports to analytics.
 * This should be placed inside the navigation container or router layout.
 */
export function TelemetryTracker() {
  const pathname = usePathname();
  const segments = useSegments();

  React.useEffect(() => {
    if (pathname) {
      // Enhanced screen name extraction
      const screenName = segments.join('/') || 'index';
      const screenType = getScreenType(screenName);
      const flowContext = getFlowContext(screenName);

      // Track screen view with enhanced context
      analytics.screen(screenName, {
        pathname,
        screen_type: screenType,
        flow_context: flowContext || 'none',
        segment_count: segments.length,
        is_modal: isModalScreen(screenName),
      });

      // Update activity for session tracking
      analytics.updateActivity();

      // Track user flow progression
      if (flowContext) {
        analytics.trackUserInteraction('screen_view', {
          screen: screenName,
          flow: flowContext,
          type: screenType,
        });
      }
    }
  }, [pathname, segments]);

  return null;
}

// --- Helper functions for screen classification ---

function getScreenType(screenName: string): string {
  if (screenName.includes('onboarding')) return 'onboarding';
  if (screenName.includes('journal') || screenName.includes('transaction')) return 'transaction';
  if (screenName.includes('account')) return 'account';
  if (screenName.includes('settings')) return 'settings';
  if (screenName.includes('import') || screenName.includes('export')) return 'data_management';
  if (screenName === 'index' || screenName === '(tabs)') return 'main';
  return 'other';
}

function getFlowContext(screenName: string): string | null {
  if (screenName.includes('onboarding')) return 'user_setup';
  if (screenName.includes('journal-entry')) return 'transaction_creation';
  if (screenName.includes('account-creation')) return 'account_setup';
  if (screenName.includes('import-selection')) return 'data_import';
  if (screenName.includes('audit-log')) return 'data_review';
  if (screenName.includes('appearance-settings')) return 'personalization';
  if (screenName.includes('privacy-security-settings')) return 'privacy_security';
  if (screenName.includes('automation-settings')) return 'automation';
  if (screenName.includes('maintenance-settings')) return 'maintenance';
  return null;
}

function isModalScreen(screenName: string): boolean {
  const modalScreens = [
    'journal-entry',
    'account-creation',
    'onboarding',
    'account-reorder',
    'manage-hierarchy',
    'appearance-settings',
  ];
  return modalScreens.some(modal => screenName.includes(modal));
}
