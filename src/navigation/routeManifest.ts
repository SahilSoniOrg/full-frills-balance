export type RoutePresentation = 'tab' | 'composer' | 'detail' | 'internal';

/** Where a workplace-scoped record route returns after a workplace switch. */
export type WorkplaceSwitchFallback = {
  readonly name: string;
  readonly params?: (params?: object) => Record<string, string>;
};

export interface RouteManifestEntry {
  readonly name: string;
  readonly presentation: RoutePresentation;
  readonly isModal: boolean;
  readonly screenType: string;
  readonly flowContext: string | null;
  readonly switchFallback?: WorkplaceSwitchFallback;
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

type DetailRouteDef = readonly [
  name: string,
  screenType: string,
  flowContext: string,
  isModal: boolean,
  switchFallback?: WorkplaceSwitchFallback,
];

const detailRoutes = [
  [
    'account-management',
    'account',
    'account_reorganization',
    true,
    {
      name: 'accounts',
      params: params => ({
        tab:
          params && 'filterMode' in params && params.filterMode === 'categories'
            ? 'categories'
            : 'accounts',
      }),
    },
  ],
  ['settings', 'settings', 'preferences_hub', false],
  ['account-details', 'account', 'account_drilldown', false, { name: 'accounts' }],
  ['journal-details', 'journal', 'transaction_review', false, { name: 'activity' }],
  [
    'planned-payment-details',
    'commitments',
    'commitment_review',
    false,
    { name: 'commitments', params: () => ({ tab: 'planned' }) },
  ],
  [
    'budget-details',
    'budget',
    'budget_review',
    false,
    { name: 'commitments', params: () => ({ tab: 'budgets' }) },
  ],
  ['insight-details', 'hub', 'insight_inspection', true, { name: 'hub' }],
  ['journal-balance-review', 'journal', 'balance_review', false, { name: 'activity' }],
  ['hub', 'hub', 'intelligence_hub', false],
  ['reports', 'reports', 'financial_reporting', false],
  ['reports-v2', 'reports', 'financial_reporting_v2', false],
  ['journal-search', 'journal', 'transaction_search', false, { name: 'activity' }],
  ['sms-inbox', 'automation', 'sms_transaction_review', false],
  ['sms-rules', 'automation', 'sms_rule_management', false],
  ['workplace-management', 'workplace_management', 'workplace_management', false],
  ['device-settings', 'settings', 'device_settings', false],
  ['personalization-settings', 'settings', 'personalization', false],
  ['data-management-settings', 'settings', 'data_management', false],
  ['audit-log', 'audit', 'audit_review', false],
  ['privacy-security-settings', 'settings', 'privacy_security', false],
  ['privacy-notice', 'settings', 'privacy_notice', false],
  ['automation-settings', 'settings', 'automation', false],
  ['sms-settings', 'settings', 'sms_settings', false],
  ['maintenance-settings', 'settings', 'maintenance', false],
  ['about-support-settings', 'settings', 'support', false],
  ['appearance-settings', 'settings', 'personalization', true],
  ['import-selection', 'data_management', 'data_import', false],
  ['_design-preview', 'developer', 'design_preview', false],
] as const satisfies readonly DetailRouteDef[];

const internalRoutes = [
  {
    name: 'widget',
    presentation: 'internal',
    isModal: false,
    screenType: 'widget_launch',
    flowContext: null,
  },
] as const satisfies readonly RouteManifestEntry[];

export const ROUTE_MANIFEST = [
  ...tabRoutes,
  ...composerRoutes.map(([name, screenType, flowContext]) => ({
    name,
    presentation: 'composer' as const,
    isModal: true,
    screenType,
    flowContext,
  })),
  ...detailRoutes.map(([name, screenType, flowContext, isModal, switchFallback]) => ({
    name,
    presentation: 'detail' as const,
    isModal,
    screenType,
    flowContext,
    ...(switchFallback ? { switchFallback } : {}),
  })),
  ...internalRoutes,
] as const satisfies readonly RouteManifestEntry[];

export type AppRouteName = (typeof ROUTE_MANIFEST)[number]['name'];

const WORKPLACE_RECORD_FALLBACKS = new Map<string, WorkplaceSwitchFallback>(
  (ROUTE_MANIFEST as readonly RouteManifestEntry[])
    .filter(
      (route): route is RouteManifestEntry & { switchFallback: WorkplaceSwitchFallback } =>
        !!route.switchFallback,
    )
    .map(route => [route.name, route.switchFallback]),
);

export function workplaceSwitchFallback(routeName: string): WorkplaceSwitchFallback | undefined {
  return WORKPLACE_RECORD_FALLBACKS.get(routeName);
}

export function isWorkplaceRecordRoute(routeName: string): boolean {
  return WORKPLACE_RECORD_FALLBACKS.has(routeName);
}
