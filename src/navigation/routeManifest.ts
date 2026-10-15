export type RoutePresentation = 'tab' | 'composer' | 'detail';
export interface RouteManifestEntry {
  readonly name: string;
  readonly presentation: RoutePresentation;
  readonly isModal: boolean;
  readonly screenType: string;
  readonly flowContext: string | null;
}

const tabRoutes = [
  {
    name: 'index',
    presentation: 'tab',
    isModal: false,
    screenType: 'dashboard',
    flowContext: 'dashboard_overview',
  },
  {
    name: '(tabs)',
    presentation: 'tab',
    isModal: false,
    screenType: 'dashboard',
    flowContext: 'dashboard_overview',
  },
  {
    name: '(tabs)/index',
    presentation: 'tab',
    isModal: false,
    screenType: 'dashboard',
    flowContext: 'dashboard_overview',
  },
  {
    name: '(tabs)/accounts',
    presentation: 'tab',
    isModal: false,
    screenType: 'account',
    flowContext: 'account_management',
  },
  {
    name: '(tabs)/activity',
    presentation: 'tab',
    isModal: false,
    screenType: 'journal',
    flowContext: 'transaction_history',
  },
  {
    name: '(tabs)/commitments',
    presentation: 'tab',
    isModal: false,
    screenType: 'commitments',
    flowContext: 'cash_flow_planning',
  },
  {
    name: '(tabs)/settings',
    presentation: 'tab',
    isModal: false,
    screenType: 'settings',
    flowContext: 'preferences_hub',
  },
] as const satisfies readonly RouteManifestEntry[];

const composerRoutes = [
  ['journal-entry', 'journal', 'transaction_creation'],
  ['onboarding', 'onboarding', 'cash_clarity_setup'],
  ['account-creation', 'account', 'account_setup'],
  ['category-creation', 'account', 'category_setup'],
  ['planned-payment-form', 'commitments', 'commitment_configuration'],
  ['budget-edit', 'budget', 'budget_configuration'],
  ['sms-rule-form', 'automation', 'sms_rule_configuration'],
] as const;

const detailRoutes = [
  ['account-management', 'account', 'account_reorganization', true],
  ['account-details', 'account', 'account_drilldown', false],
  ['journal-details', 'journal', 'transaction_review', false],
  ['planned-payment-details', 'commitments', 'commitment_review', false],
  ['budget-details', 'budget', 'budget_review', false],
  ['insight-details', 'hub', 'insight_inspection', true],
  ['journal-balance-review', 'journal', 'balance_review', false],
  ['hub', 'hub', 'intelligence_hub', false],
  ['reports', 'reports', 'financial_reporting', false],
  ['reports-v2', 'reports', 'financial_reporting_v2', false],
  ['journal-search', 'journal', 'transaction_search', false],
  ['sms-inbox', 'automation', 'sms_transaction_review', false],
  ['sms-rules', 'automation', 'sms_rule_management', false],
  ['workplace-settings', 'settings', 'workplace_management', false],
  ['device-settings', 'settings', 'device_settings', false],
  ['personalization-settings', 'settings', 'personalization', false],
  ['data-management-settings', 'settings', 'data_management', false],
  ['audit-log', 'audit', 'audit_review', false],
  ['privacy-security-settings', 'settings', 'privacy_security', false],
  ['privacy-notice', 'settings', 'privacy_notice', false],
  ['current-workplace-settings', 'settings', 'current_workplace', false],
  ['automation-settings', 'settings', 'automation', false],
  ['sms-settings', 'settings', 'sms_settings', false],
  ['maintenance-settings', 'settings', 'maintenance', false],
  ['about-support-settings', 'settings', 'support', false],
  ['appearance-settings', 'settings', 'personalization', true],
  ['import-selection', 'data_management', 'data_import', false],
  ['_design-preview', 'developer', 'design_preview', false],
] as const;

export const ROUTE_MANIFEST = [
  ...tabRoutes,
  ...composerRoutes.map(([name, screenType, flowContext]) => ({
    name,
    presentation: 'composer' as const,
    isModal: true,
    screenType,
    flowContext,
  })),
  ...detailRoutes.map(([name, screenType, flowContext, isModal]) => ({
    name,
    presentation: 'detail' as const,
    isModal,
    screenType,
    flowContext,
  })),
] as const satisfies readonly RouteManifestEntry[];

export type AppRouteName = (typeof ROUTE_MANIFEST)[number]['name'];
