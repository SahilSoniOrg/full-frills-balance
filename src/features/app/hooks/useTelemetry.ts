import { analytics } from '@/src/services/analytics';
import type { ExpoRouter } from 'expo-router';
import { usePathname, useSegments } from 'expo-router';
import React from 'react';

export interface RouteMetadata {
  screenType: string;
  flowContext: string | null;
  isModal: boolean;
}

/**
 * Extracts all valid route pathnames from Expo Router's auto-generated typed route tree,
 * excluding external URI schemes, relative dot-paths, and auto-generated system routes.
 */
type RawAppRoutePath = Exclude<
  ExpoRouter.__routes['hrefInputParams']['pathname'],
  `${string}:${string}` | `.${string}` | `/_sitemap`
>;

/**
 * Normalizes leading '/' and converts root '/' to 'index' to match Expo Router `segments.join('/')`.
 */
type NormalizeRouteSegment<T extends string> = T extends `/${infer Rest}`
  ? Rest extends ''
    ? 'index'
    : Rest
  : T extends ''
    ? 'index'
    : T;

export type AppScreenRoute = NormalizeRouteSegment<RawAppRoutePath> | '(tabs)/index';

/**
 * Exhaustive Route Metadata Dictionary.
 * Every screen in app/ MUST be declared here or TypeScript compilation will fail.
 */
const ROUTE_METADATA_MAP: Record<
  Exclude<AppScreenRoute, 'account-reorder' | 'manage-hierarchy'> | 'account-management',
  RouteMetadata
> = {
  // Tabs & Roots
  index: { screenType: 'dashboard', flowContext: 'dashboard_overview', isModal: false },
  '(tabs)': { screenType: 'dashboard', flowContext: 'dashboard_overview', isModal: false },
  '(tabs)/index': { screenType: 'dashboard', flowContext: 'dashboard_overview', isModal: false },
  '(tabs)/accounts': { screenType: 'account', flowContext: 'account_management', isModal: false },
  accounts: { screenType: 'account', flowContext: 'account_management', isModal: false },
  '(tabs)/activity': { screenType: 'journal', flowContext: 'transaction_history', isModal: false },
  activity: { screenType: 'journal', flowContext: 'transaction_history', isModal: false },
  '(tabs)/commitments': {
    screenType: 'commitments',
    flowContext: 'cash_flow_planning',
    isModal: false,
  },
  commitments: { screenType: 'commitments', flowContext: 'cash_flow_planning', isModal: false },
  '(tabs)/settings': { screenType: 'settings', flowContext: 'preferences_hub', isModal: false },
  settings: { screenType: 'settings', flowContext: 'preferences_hub', isModal: false },

  // Accounts & Categories
  'account-creation': { screenType: 'account', flowContext: 'account_setup', isModal: true },
  'category-creation': { screenType: 'account', flowContext: 'category_setup', isModal: true },
  'account-details': { screenType: 'account', flowContext: 'account_drilldown', isModal: false },
  'account-management': {
    screenType: 'account',
    flowContext: 'account_reorganization',
    isModal: true,
  },

  // Journal & Transactions
  'journal-entry': { screenType: 'journal', flowContext: 'transaction_creation', isModal: true },
  'journal-details': { screenType: 'journal', flowContext: 'transaction_review', isModal: false },
  'journal-search': { screenType: 'journal', flowContext: 'transaction_search', isModal: false },

  // Budgets & Planned Payments
  'budget-details': { screenType: 'budget', flowContext: 'budget_review', isModal: false },
  'budget-edit': { screenType: 'budget', flowContext: 'budget_configuration', isModal: true },
  'planned-payment-details': {
    screenType: 'commitments',
    flowContext: 'commitment_review',
    isModal: false,
  },
  'planned-payment-form': {
    screenType: 'commitments',
    flowContext: 'commitment_configuration',
    isModal: true,
  },

  // Reports, Hub & Insights
  reports: { screenType: 'reports', flowContext: 'financial_reporting', isModal: false },
  hub: { screenType: 'hub', flowContext: 'intelligence_hub', isModal: false },
  'insight-details': { screenType: 'hub', flowContext: 'insight_inspection', isModal: true },
  'audit-log': { screenType: 'audit', flowContext: 'audit_review', isModal: false },

  // SMS & Automation
  'sms-inbox': { screenType: 'automation', flowContext: 'sms_transaction_review', isModal: false },
  'sms-rules': { screenType: 'automation', flowContext: 'sms_rule_management', isModal: false },
  'sms-rule-form': {
    screenType: 'automation',
    flowContext: 'sms_rule_configuration',
    isModal: true,
  },

  // Settings & Configuration
  'appearance-settings': { screenType: 'settings', flowContext: 'personalization', isModal: true },
  'automation-settings': { screenType: 'settings', flowContext: 'automation', isModal: false },
  'personalization-settings': {
    screenType: 'settings',
    flowContext: 'personalization',
    isModal: false,
  },
  'privacy-security-settings': {
    screenType: 'settings',
    flowContext: 'privacy_security',
    isModal: false,
  },
  'workplace-settings': {
    screenType: 'settings',
    flowContext: 'workplace_management',
    isModal: false,
  },
  'data-management-settings': {
    screenType: 'settings',
    flowContext: 'data_management',
    isModal: false,
  },
  'maintenance-settings': { screenType: 'settings', flowContext: 'maintenance', isModal: false },
  'about-support-settings': { screenType: 'settings', flowContext: 'support', isModal: false },

  // Data Import & Onboarding
  'import-selection': { screenType: 'data_management', flowContext: 'data_import', isModal: false },
  onboarding: { screenType: 'onboarding', flowContext: 'user_setup', isModal: true },

  // Dev & Preview
  'ai-example': { screenType: 'developer', flowContext: 'ai_sandbox', isModal: false },
  '_design-preview': { screenType: 'developer', flowContext: 'design_preview', isModal: false },
};

type RouteMetadataKey = keyof typeof ROUTE_METADATA_MAP;

function resolveRouteMetadata(screenName: string): RouteMetadata {
  const direct = ROUTE_METADATA_MAP[screenName as RouteMetadataKey];
  if (direct) return direct;

  const baseSegment = screenName.split('/').pop() || screenName;
  if (baseSegment in ROUTE_METADATA_MAP) {
    return ROUTE_METADATA_MAP[baseSegment as RouteMetadataKey];
  }

  const matchedKey = Object.keys(ROUTE_METADATA_MAP).find(k => screenName.includes(k));
  if (matchedKey) return ROUTE_METADATA_MAP[matchedKey as RouteMetadataKey];

  return {
    screenType: 'other',
    flowContext: null,
    isModal: /entry|creation|edit|form|modal/.test(screenName),
  };
}

/**
 * Hook that listens to navigation changes and reports to analytics.
 */
export function useTelemetry() {
  const pathname = usePathname();
  const segments = useSegments();
  const currentScreenRef = React.useRef<string | null>(null);
  const screenStartTimeRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (!pathname) return;

    const screenName = segments.join('/') || 'index';
    const previousScreen = currentScreenRef.current;
    const now = Date.now();

    if (previousScreen !== screenName) {
      const previousDwellMs = previousScreen ? now - screenStartTimeRef.current : 0;

      if (previousScreen) {
        analytics.track('screen_leave', {
          screen: previousScreen,
          dwell_time_ms: previousDwellMs,
          dwell_time_sec: Math.round(previousDwellMs / 1000),
          next_screen: screenName,
        });
      }

      currentScreenRef.current = screenName;
      screenStartTimeRef.current = now;

      const meta = resolveRouteMetadata(screenName);

      // Track screen view with enhanced context including previous screen
      analytics.screen(screenName, {
        pathname,
        screen_type: meta.screenType,
        flow_context: meta.flowContext || 'none',
        segment_count: segments.length,
        is_modal: meta.isModal,
        previous_screen: previousScreen || 'none',
        previous_screen_dwell_ms: previousDwellMs,
      });

      // Update activity for session tracking
      analytics.updateActivity();

      // Track user flow progression
      if (meta.flowContext) {
        analytics.trackUserInteraction('screen_view', {
          screen: screenName,
          previous_screen: previousScreen || 'none',
          flow: meta.flowContext,
          type: meta.screenType,
        });
      }
    }
  }, [pathname, segments]);
}
