export type RoutePresentation = 'tab' | 'composer' | 'detail';
export type RoutePrivacy = 'safe' | 'parameterized';

export interface RouteManifestEntry {
  readonly name: string;
  readonly title: string;
  readonly presentation: RoutePresentation;
  readonly isModal: boolean;
  readonly privacy: RoutePrivacy;
  readonly screenType: string;
  readonly flowContext: string | null;
}

const tabRoutes = [
  {
    name: 'index',
    title: 'Dashboard',
    presentation: 'tab',
    isModal: false,
    privacy: 'safe',
    screenType: 'dashboard',
    flowContext: 'dashboard_overview',
  },
  {
    name: '(tabs)',
    title: 'Dashboard',
    presentation: 'tab',
    isModal: false,
    privacy: 'safe',
    screenType: 'dashboard',
    flowContext: 'dashboard_overview',
  },
  {
    name: '(tabs)/index',
    title: 'Dashboard',
    presentation: 'tab',
    isModal: false,
    privacy: 'safe',
    screenType: 'dashboard',
    flowContext: 'dashboard_overview',
  },
  {
    name: '(tabs)/accounts',
    title: 'Accounts',
    presentation: 'tab',
    isModal: false,
    privacy: 'safe',
    screenType: 'account',
    flowContext: 'account_management',
  },
  {
    name: '(tabs)/activity',
    title: 'Activity',
    presentation: 'tab',
    isModal: false,
    privacy: 'safe',
    screenType: 'journal',
    flowContext: 'transaction_history',
  },
  {
    name: '(tabs)/commitments',
    title: 'Commitments',
    presentation: 'tab',
    isModal: false,
    privacy: 'safe',
    screenType: 'commitments',
    flowContext: 'cash_flow_planning',
  },
  {
    name: '(tabs)/settings',
    title: 'Settings',
    presentation: 'tab',
    isModal: false,
    privacy: 'safe',
    screenType: 'settings',
    flowContext: 'preferences_hub',
  },
] as const satisfies readonly RouteManifestEntry[];

const composerRoutes = [
  ['journal-entry', 'New transaction', 'journal', 'transaction_creation'],
  ['onboarding', 'Onboarding', 'onboarding', 'cash_clarity_setup'],
  ['account-creation', 'New account', 'account', 'account_setup'],
  ['category-creation', 'New category', 'account', 'category_setup'],
  ['planned-payment-form', 'Planned payment', 'commitments', 'commitment_configuration'],
  ['budget-edit', 'Edit budget', 'budget', 'budget_configuration'],
  ['sms-rule-form', 'SMS rule', 'automation', 'sms_rule_configuration'],
] as const;

const detailRoutes = [
  ['account-management', 'Manage accounts', 'account', 'account_reorganization', true],
  ['account-details', 'Account details', 'account', 'account_drilldown', false],
  ['journal-details', 'Transaction details', 'journal', 'transaction_review', false],
  ['planned-payment-details', 'Planned payment details', 'commitments', 'commitment_review', false],
  ['budget-details', 'Budget details', 'budget', 'budget_review', false],
  ['insight-details', 'Insight details', 'hub', 'insight_inspection', true],
  ['journal-balance-review', 'Balance review', 'journal', 'balance_review', false],
  ['hub', 'Review', 'hub', 'intelligence_hub', false],
  ['reports', 'Reports', 'reports', 'financial_reporting', false],
  ['reports-v2', 'Reports', 'reports', 'financial_reporting_v2', false],
  ['journal-search', 'Search activity', 'journal', 'transaction_search', false],
  ['sms-inbox', 'SMS inbox', 'automation', 'sms_transaction_review', false],
  ['sms-rules', 'SMS rules', 'automation', 'sms_rule_management', false],
  ['workplace-settings', 'Workplace settings', 'settings', 'workplace_management', false],
  ['device-settings', 'Device settings', 'settings', 'device_settings', false],
  ['personalization-settings', 'Personalization', 'settings', 'personalization', false],
  ['data-management-settings', 'Data management', 'settings', 'data_management', false],
  ['audit-log', 'Audit log', 'audit', 'audit_review', false],
  ['privacy-security-settings', 'Privacy & security', 'settings', 'privacy_security', false],
  ['privacy-notice', 'Privacy notice', 'settings', 'privacy_notice', false],
  ['current-workplace-settings', 'Current workplace', 'settings', 'current_workplace', false],
  ['automation-settings', 'Automation', 'settings', 'automation', false],
  ['sms-settings', 'SMS settings', 'settings', 'sms_settings', false],
  ['maintenance-settings', 'Maintenance', 'settings', 'maintenance', false],
  ['about-support-settings', 'About & support', 'settings', 'support', false],
  ['appearance-settings', 'Appearance', 'settings', 'personalization', true],
  ['import-selection', 'Import data', 'data_management', 'data_import', false],
  ['_design-preview', 'Design preview', 'developer', 'design_preview', false],
] as const;

export const ROUTE_MANIFEST = [
  ...tabRoutes,
  ...composerRoutes.map(([name, title, screenType, flowContext]) => ({
    name,
    title,
    presentation: 'composer' as const,
    isModal: true,
    privacy: 'safe' as const,
    screenType,
    flowContext,
  })),
  ...detailRoutes.map(([name, title, screenType, flowContext, isModal]) => ({
    name,
    title,
    presentation: 'detail' as const,
    isModal,
    privacy: 'safe' as const,
    screenType,
    flowContext,
  })),
] as const satisfies readonly RouteManifestEntry[];

export type AppRouteName = (typeof ROUTE_MANIFEST)[number]['name'];

export const ROUTE_MANIFEST_BY_NAME = Object.fromEntries(
  ROUTE_MANIFEST.map(route => [route.name, route]),
) as Record<AppRouteName, (typeof ROUTE_MANIFEST)[number]>;
