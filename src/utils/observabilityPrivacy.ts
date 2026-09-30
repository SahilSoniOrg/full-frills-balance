import type { ErrorEvent, TransactionEvent } from '@sentry/react-native';
import { COMMON_CURRENCIES } from '@/src/constants/currency-definitions';
import { FontIds, ThemeIds } from '@/src/constants/design-tokens';
import { AccountType, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';

type PropertyKind = 'boolean' | 'count' | 'duration' | 'currency' | 'token' | 'version';

type EventSchema = Record<string, PropertyKind>;

const ENUM_VALUES: Record<string, ReadonlySet<string>> = {
  type: new Set([
    'asset',
    'liability',
    'income',
    'expense',
    'transfer',
    'checking',
    'savings',
    'cash',
    'credit',
    'loan',
  ]),
  mode: new Set(['simple', 'advanced', 'import', 'web', 'file']),
  theme: new Set(['light', 'dark', 'system', 'ocean', 'forest', 'sunset', 'midnight']),
  themeId: new Set(['default', 'ocean', 'forest', 'sunset', 'midnight']),
  fontId: new Set(['system', 'inter', 'roboto', 'open-sans']),
  cadence: new Set(['daily', 'weekly', 'monthly', 'never']),
  interval: new Set(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']),
  choice: new Set(['fix_now', 'later', 'dismissed']),
  source: new Set(['manual', 'system', 'import', 'sms', 'restore', 'cleanup', 'user']),
  format: new Set(['csv', 'json', 'pdf', 'zip', 'text', 'ofx', 'qif']),
  requested_format: new Set(['csv', 'json', 'pdf', 'zip', 'text']),
  effective_format: new Set(['csv', 'json', 'pdf', 'zip', 'text', 'file']),
  platform: new Set(['ios', 'android', 'web']),
  status: new Set(['success', 'failed', 'started', 'completed', 'cancelled', 'denied', 'timeout']),
  reason: new Set([
    'cancelled',
    'failed',
    'unsupported',
    'permission_denied',
    'timeout',
    'unknown',
  ]),
  scope: new Set(['all', 'journal', 'account', 'budget', 'planned_payment', 'category']),
  tab: new Set(['overview', 'accounts', 'activity', 'insights', 'reports', 'settings']),
  timeframe: new Set(['week', 'month', 'quarter', 'year', 'all']),
  section: new Set(['income', 'expenses', 'planned', 'accounts', 'summary']),
  action: new Set([
    'create',
    'update',
    'delete',
    'view',
    'open',
    'close',
    'select',
    'dismiss',
    'restore',
  ]),
  interactionType: new Set(['press', 'select', 'zoom', 'scroll', 'toggle']),
  chartName: new Set(['cash_flow', 'spending', 'income', 'net_worth', 'safe_to_spend']),
  metric: new Set([
    'JournalList.LoadTime',
    'ExchangeRateService.fetchNetwork',
    'time_to_interactive',
  ]),
  unit: new Set(['ms', 's', 'count']),
  conversion_event: new Set(['onboarding_completed', 'first_transaction_created']),
  engagement_type: new Set(['session', 'screen', 'feature']),
  entity_type: new Set(['journal', 'budget', 'account', 'planned_payment']),
  issueType: new Set(['missing_account', 'unbalanced_journal', 'missing_currency']),
  table: new Set(['journals', 'accounts', 'budgets', 'planned_payments', 'transaction_inbox']),
  screen_type: new Set(['modal', 'tab', 'screen']),
  flow: new Set(['onboarding', 'journal', 'account', 'budget', 'settings']),
  entrypoint: new Set(['dashboard', 'journal', 'accounts', 'settings', 'notification', 'widget']),
  target: new Set(['journal', 'account', 'budget', 'planned_payment', 'settings']),
  icon: new Set(['wallet', 'bank', 'cash', 'credit-card', 'home', 'briefcase', 'chart']),
};

const SAFE_ANALYTICS_EVENT_NAMES = new Set([
  'app_opened',
  'account_created',
  'transaction_created',
  'privacy_policy_acknowledged',
  'theme_changed',
  'notification_preference_changed',
  'workplace_created',
  'workplace_switched',
  'workplace_deleted',
  'budget_created',
  'planned_payment_created',
  'sms_rule_triggered',
  'sms_import_settings_changed',
  'chart_interacted',
  'search_performed',
  'integrity_issue',
  'journal_balance_checked',
  'unbalanced_journals_prompt_answered',
  'unbalanced_journals_cleared',
  'export_completed',
  'factory_reset',
  'entrypoint_opened',
  'entrypoint_selected',
  'session_start',
  'session_end',
  'app_error',
  'app_cold_start',
  'screen_leave',
  'screen_view',
  'user_screen_view',
  'first_paint',
  'conversion',
  'performance',
  'engagement',
  'share_started',
  'share_sheet_opened',
  'share_failed',
  'save_started',
  'save_to_disk_completed',
  'save_to_disk_abandoned',
  'save_to_disk_cancelled_final',
  'save_confirm_share',
  'save_confirm_dismiss',
  'save_completed',
  'save_failed_dismissed',
]);
const CURRENCY_CODES = new Set(COMMON_CURRENCIES.map(currency => currency.code));
const ACCOUNT_TYPES = new Set(Object.values(AccountType));
const PAYMENT_INTERVALS = new Set(Object.values(PlannedPaymentInterval));
const PAYMENT_STATUSES = new Set(Object.values(PlannedPaymentStatus));
const THEME_IDS = new Set(Object.values(ThemeIds));
const FONT_IDS = new Set(Object.values(FontIds));
const SAFE_TO_SPEND_SECTIONS = new Set(['assets', 'income', 'committed', 'debts']);
const SAFE_TO_SPEND_LEGENDS = new Set(['safe', 'committed', 'debts']);

const ANALYTICS_ENUM_VALUES: Record<string, Readonly<Record<string, ReadonlySet<string>>>> = {
  account_created: { type: ACCOUNT_TYPES },
  transaction_created: {
    mode: new Set(['simple', 'advanced', 'import']),
    type: new Set(['create', 'update']),
  },
  planned_payment_created: {
    interval: PAYMENT_INTERVALS,
    type: new Set(['auto', 'manual']),
  },
  theme_changed: {
    theme: new Set(['light', 'dark', 'system']),
    themeId: THEME_IDS,
    fontId: FONT_IDS,
  },
};

const FEATURE_ENUM_VALUES: Record<string, Readonly<Record<string, ReadonlySet<string>>>> = {
  account: { account_type: ACCOUNT_TYPES },
  planned_payment: { status: PAYMENT_STATUSES },
  safe_to_spend: {
    section: SAFE_TO_SPEND_SECTIONS,
    item: SAFE_TO_SPEND_LEGENDS,
    slice: SAFE_TO_SPEND_LEGENDS,
  },
};

const ANALYTICS_EVENT_SCHEMAS: Record<string, EventSchema> = {
  app_opened: {
    version: 'version',
    app_version: 'version',
    build: 'version',
    app_build: 'version',
  },
  account_created: { type: 'token', currency: 'currency' },
  transaction_created: { mode: 'token', type: 'token', currency: 'currency' },
  privacy_policy_acknowledged: { policy_version: 'version' },
  theme_changed: { theme: 'token', themeId: 'token', fontId: 'token' },
  notification_preference_changed: { cadence: 'token', hour: 'count' },
  workplace_created: { name_length: 'count', icon: 'token' },
  workplace_switched: { fromId: 'token', toId: 'token' },
  workplace_deleted: {},
  budget_created: { currency: 'currency' },
  planned_payment_created: { interval: 'token', type: 'token' },
  sms_rule_triggered: { isAutoPosted: 'boolean' },
  sms_import_settings_changed: { enabled: 'boolean' },
  chart_interacted: { chartName: 'token', interactionType: 'token' },
  search_performed: { scope: 'token', queryLength: 'count' },
  integrity_issue: { table: 'token', issueType: 'token' },
  journal_balance_checked: { unbalanced_count: 'count', journals_checked: 'count' },
  unbalanced_journals_prompt_answered: { choice: 'token' },
  unbalanced_journals_cleared: { peak_count: 'count', days_open: 'count', source: 'token' },
  export_completed: { format: 'token' },
  factory_reset: {},
  entrypoint_opened: { screen: 'token', entrypoint: 'token' },
  entrypoint_selected: { screen: 'token', entrypoint: 'token', target: 'token' },
  session_start: {},
  session_end: { session_duration_ms: 'duration', session_duration_min: 'count' },
  app_error: { name: 'token' },
  app_cold_start: {
    time_to_interactive_ms: 'duration',
    time_to_interactive_sec: 'duration',
    is_data_hydrated: 'boolean',
  },
  screen_leave: {
    screen: 'token',
    dwell_time_ms: 'duration',
    dwell_time_sec: 'duration',
    next_screen: 'token',
  },
  screen_view: {
    screen: 'token',
    previous_screen: 'token',
    flow: 'token',
    type: 'token',
    screen_type: 'token',
    flow_context: 'token',
    is_modal: 'boolean',
    segment_count: 'count',
    previous_screen_dwell_ms: 'duration',
  },
  user_screen_view: {
    screen: 'token',
    screen_type: 'token',
    flow_context: 'token',
    is_modal: 'boolean',
  },
  first_paint: { duration_ms: 'duration', is_cold_boot: 'boolean' },
  conversion: { conversion_event: 'token', timestamp: 'duration' },
  performance: {
    metric: 'token',
    value: 'duration',
    unit: 'token',
    timestamp: 'duration',
    traceId: 'token',
  },
  engagement: {
    engagement_type: 'token',
    session_duration_ms: 'duration',
    session_duration_min: 'count',
  },
  share_started: { requested_format: 'token', effective_format: 'token', content_size: 'count' },
  share_sheet_opened: { format: 'token', mode: 'token', platform: 'token' },
  share_failed: { reason: 'token' },
  save_started: { requested_format: 'token', effective_format: 'token', content_size: 'count' },
  save_to_disk_completed: { platform: 'token' },
  save_to_disk_abandoned: { platform: 'token' },
  save_to_disk_cancelled_final: { platform: 'token' },
  save_confirm_share: {},
  save_confirm_dismiss: {},
  save_completed: { format: 'token' },
  save_failed_dismissed: { reason: 'token' },
};

const FEATURE_EVENT_SCHEMAS: Record<string, EventSchema> = {
  journal: { mode: 'token', type: 'token', currency: 'currency', count: 'count', source: 'token' },
  account: {
    type: 'token',
    account_type: 'token',
    currency: 'currency',
    count: 'count',
    source: 'token',
  },
  import: { format: 'token', reason: 'token', count: 'count', source: 'token' },
  audit: { entity_type: 'token', success: 'boolean', reason: 'token' },
  hub: { tab: 'token', action: 'token' },
  reports: { tab: 'token', timeframe: 'token', count: 'count', source: 'token' },
  voice_journal: { status: 'token', mode: 'token', duration_ms: 'duration' },
  sms: { mode: 'token', status: 'token', count: 'count', success: 'boolean' },
  budget: { currency: 'currency', count: 'count', threshold: 'token' },
  planned_payment: { status: 'token', count: 'count', source: 'token' },
  data_management: { format: 'token', count: 'count', success: 'boolean', table: 'token' },
  dashboard: { visible: 'boolean', action: 'token' },
  safe_to_spend: { section: 'token', item: 'token', slice: 'token', isOverCommitted: 'boolean' },
  search: { scope: 'token', count: 'count', query_length: 'count' },
  settings: {
    enabled: 'boolean',
    visible: 'boolean',
    theme: 'token',
    font: 'token',
    cadence: 'token',
    hour: 'count',
    minute: 'count',
    weekday: 'count',
    currency_code: 'currency',
    days: 'count',
    icon: 'token',
  },
  onboarding: { step: 'token', count: 'count' },
  ai: { status: 'token', mode: 'token', duration_ms: 'duration', success: 'boolean' },
  journal_search: { scope: 'token', count: 'count', query_length: 'count' },
};

const FEATURE_ACTIONS: Record<string, ReadonlySet<string>> = {
  journal: new Set([
    'create',
    'update',
    'delete',
    'recover',
    'post',
    'revert_to_planned',
    'duplicate',
    'reversal',
    'bulk_create',
    'suggestion_accepted',
  ]),
  account: new Set([
    'create',
    'update',
    'delete',
    'recover',
    'merge',
    'reconcile',
    'reorder',
    'archive',
    'unarchive',
    'convert_type',
    'bulk_archive',
    'bulk_rename',
    'bulk_appearance',
    'bulk_move_hierarchy',
  ]),
  import: new Set([
    'file_selected',
    'format_mismatch',
    'cancelled',
    'failed',
    'picker_cancelled',
    'picker_error',
    'completed',
  ]),
  audit: new Set(['view_entity', 'revert_initiated', 'revert_success', 'revert_failed']),
  hub: new Set(['change_tab', 'dismiss_insight', 'restore_insight']),
  reports: new Set([
    'change_tab',
    'change_timeframe',
    'drilldown_transactions',
    'drilldown_category',
  ]),
  voice_journal: new Set([
    'record_started',
    'permission_denied',
    'speech_error',
    'template_selected',
    'parsed',
    'parse_failed',
    'applied',
  ]),
  sms: new Set([
    'rule_create',
    'rule_update',
    'rule_delete',
    'rule_toggle',
    'rule_test',
    'inbox_accept',
    'inbox_dismiss',
    'inbox_bulk_sync',
  ]),
  budget: new Set(['create', 'update', 'delete', 'threshold_warning', 'drilldown']),
  planned_payment: new Set([
    'create',
    'update',
    'delete',
    'pause',
    'resume',
    'toggle_status',
    'post_now',
    'skip',
    'occurrence_paid',
    'occurrence_skipped',
  ]),
  data_management: new Set([
    'export_initiated',
    'export_completed',
    'database_vacuum',
    'integrity_check',
    'journal_balance_audit',
    'factory_reset_initiated',
    'factory_reset_completed',
  ]),
  dashboard: new Set(['safe_to_spend_toggle', 'quick_action', 'networth_visibility_toggle']),
  safe_to_spend: new Set([
    'opened',
    'closed',
    'section_expanded',
    'legend_pressed',
    'chart_point_selected',
    'planned_payment_viewed',
    'account_viewed',
    'legend_to_explanation',
  ]),
  search: new Set(['query_executed', 'filters_applied', 'result_selected']),
  settings: new Set([
    'change_theme',
    'change_theme_preference',
    'change_font',
    'change_hour_cycle',
    'toggle_monthly_stats',
    'toggle_compact_account_picker',
    'toggle_privacy_mode',
    'toggle_widget_privacy',
    'toggle_app_lock',
    'switch_workplace',
    'create_workplace',
    'update_workplace_icon',
    'change_notification_cadence',
    'change_notification_time',
    'toggle_sms_import',
    'export_data',
    'integrity_check',
    'cleanup_database',
    'seed_mock_data',
    'open_telegram',
    'open_play_store',
    'open_github',
    'share_bug_report',
    'save_bug_report',
    'change_name',
    'change_currency',
    'change_safe_to_spend_days',
    'toggle_safe_to_spend_chart',
    'toggle_reduce_motion',
  ]),
  onboarding: new Set(['completed', 'step_continue']),
  ai: new Set([
    'model_load_success',
    'model_load_failure',
    'inference_completed',
    'inference_failed',
  ]),
  journal_search: new Set(['query_details']),
};

const SAFE_SCREEN_SEGMENTS = new Set([
  '(tabs)',
  'index',
  'settings',
  'commitments',
  'activity',
  'accounts',
  'journal',
  'journal-details',
  'journal-entry',
  'journal-search',
  'account-details',
  'account-creation',
  'account-management',
  'budget-details',
  'budget-edit',
  'planned-payment-details',
  'planned-payment-form',
  'reports',
  'reports-v2',
  'hub',
  'insight-details',
  'audit-log',
  'workplace-settings',
  'current-workplace-settings',
  'device-settings',
  'appearance-settings',
  'privacy-security-settings',
  'personalization-settings',
  'maintenance-settings',
  'data-management-settings',
  'automation-settings',
  'sms-inbox',
  'sms-rules',
  'sms-rule-form',
  'import-selection',
  'onboarding',
  'privacy-notice',
  'journal-balance-review',
  'category-creation',
  'about-support-settings',
  '(_layout)',
  '_layout',
  '_design-preview',
]);

function sanitizeScreenName(value: string): string {
  const segments = value.split('/').filter(Boolean);
  if (!segments.length) return 'other';
  const safe = segments.map(segment => {
    if (SAFE_SCREEN_SEGMENTS.has(segment)) return segment;
    if (/^\[[A-Za-z][A-Za-z0-9_]*\]$/.test(segment)) return '[id]';
    return 'other';
  });
  return safe.join('/');
}

function validProperty(
  key: string,
  value: unknown,
  kind: PropertyKind,
  eventName: string,
  featureName?: string,
): value is string | number | boolean {
  if (kind === 'boolean') return typeof value === 'boolean';
  if (kind === 'count' || kind === 'duration') {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }
  if (typeof value !== 'string' || value.length > 64) return false;
  if (kind === 'currency') return /^[A-Z]{3}$/.test(value) && CURRENCY_CODES.has(value);
  if (kind === 'version') return safeVersion(value) !== undefined;
  if (['fromId', 'toId'].includes(key)) return safeGeneratedId(value);
  const eventValues = ANALYTICS_ENUM_VALUES[eventName]?.[key];
  if (eventValues) return eventValues.has(value);
  const featureValues = featureName ? FEATURE_ENUM_VALUES[featureName]?.[key] : undefined;
  if (featureValues) return featureValues.has(value);
  return ENUM_VALUES[key]?.has(value) ?? false;
}

function safeGeneratedId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value) ||
      /^[A-Za-z0-9_-]{21,32}$/.test(value))
  );
}

export function sanitizeAnalyticsProperties(
  eventName: string,
  properties?: Record<string, unknown>,
): Record<string, string | number | boolean> | null {
  if (!SAFE_ANALYTICS_EVENT_NAMES.has(eventName) && !eventName.startsWith('feature_')) return null;
  let schema = ANALYTICS_EVENT_SCHEMAS[eventName];
  let featureName: string | undefined;
  let featureAction: string | undefined;
  if (!schema && eventName.startsWith('feature_')) {
    const featureAndAction = eventName.slice('feature_'.length);
    const feature = Object.keys(FEATURE_ACTIONS)
      .sort((left, right) => right.length - left.length)
      .find(candidate => featureAndAction.startsWith(`${candidate}_`));
    const action = feature ? featureAndAction.slice(feature.length + 1) : '';
    if (feature && FEATURE_ACTIONS[feature].has(action)) {
      schema = { feature: 'token', action: 'token', ...FEATURE_EVENT_SCHEMAS[feature] };
      featureName = feature;
      featureAction = action;
    }
  }
  if (!schema) return null;

  const result: Record<string, string | number | boolean> = {};
  for (const [key, kind] of Object.entries(schema)) {
    if (key === 'feature' && featureName) {
      result.feature = featureName;
      continue;
    }
    if (key === 'action' && featureAction) {
      result.action = featureAction;
      continue;
    }
    const value = properties?.[key];
    if (typeof value === 'string' && ['screen', 'next_screen', 'previous_screen'].includes(key)) {
      result[key] = sanitizeScreenName(value);
      continue;
    }
    if (key === 'name' && eventName === 'app_error') {
      result.name = safeErrorName(value);
      continue;
    }
    if (validProperty(key, value, kind, eventName, featureName)) result[key] = value;
  }
  return result;
}

export function sanitizeGlobalAnalyticsProperties(
  properties: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const key of [
    '$app_version',
    '$app_build',
    '$app_build_number',
    '$os_name',
    '$os_version',
    '$is_tablet',
    '$is_dev',
    '$app_variant',
    '$build_type',
    '$db_schema_version',
    'is_test_build',
    'active_currency',
  ]) {
    const value = properties[key];
    if (
      key === '$os_name' &&
      ['iOS', 'Android', 'Web', 'ios', 'android', 'web'].includes(String(value))
    ) {
      result[key] = String(value);
    } else if (key === '$os_version' && safeVersion(value)) result[key] = safeVersion(value)!;
    else if (key === 'active_currency' && typeof value === 'string' && CURRENCY_CODES.has(value))
      result[key] = value;
    else if (
      key === '$app_variant' &&
      ['production', 'development', 'preview'].includes(String(value))
    )
      result[key] = String(value);
    else if (
      key === '$build_type' &&
      ['production', 'development', 'preview'].includes(String(value))
    )
      result[key] = String(value);
    else if (key === '$app_version' && safeVersion(value)) result[key] = safeVersion(value)!;
    else if (['$app_build', '$app_build_number'].includes(key) && safeVersion(value))
      result[key] = safeVersion(value)!;
    else if (typeof value === 'boolean' && ['is_test_build', '$is_dev', '$is_tablet'].includes(key))
      result[key] = value;
    else if (
      ['$app_build', '$app_build_number', '$db_schema_version'].includes(key) &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0
    )
      result[key] = value;
  }
  const workplaceId = properties.$active_workplace_id;
  if (safeGeneratedId(workplaceId)) {
    result.$active_workplace_id = workplaceId;
  }
  return result;
}

const SAFE_DIAGNOSTIC_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'AggregateError',
  'AbortError',
  'Invariant Violation',
]);

export function safeErrorName(value: unknown): string {
  if (typeof value !== 'string') return 'Error';
  return SAFE_DIAGNOSTIC_NAMES.has(value) ? value : 'ApplicationError';
}

export function safeAnalyticsIdentity(value: unknown): string {
  if (typeof value !== 'string') return 'anonymous';
  const uuid = '[a-f\\d]{8}-[a-f\\d]{4}-[1-8][a-f\\d]{3}-[89ab][a-f\\d]{3}-[a-f\\d]{12}';
  if (new RegExp(`^${uuid}$`, 'i').test(value)) return value;
  return new RegExp(`^(?:anon|dev|preview|sim|e2e)_${uuid}$`, 'i').test(value)
    ? value
    : 'anonymous';
}

function safeStackFrames(stack?: string): string | undefined {
  if (!stack) return undefined;
  const frames = stack
    .split('\n')
    .slice(1)
    .map(line => {
      const match = line.match(/^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
      if (!match) return undefined;
      const rawFile = match[2].replace(/\\/g, '/');
      const file = safeCodeFramePath(rawFile);
      if (!file) return undefined;
      const fn = safeCodeFrameFunction(match[1]);
      return `    at ${fn} (${file}:${match[3]}:${match[4]})`;
    })
    .filter((frame): frame is string => !!frame)
    .slice(0, 20);
  return frames.length ? frames.join('\n') : undefined;
}

const SAFE_CODE_DIRECTORIES = new Set([
  'src',
  'features',
  'services',
  'data',
  'repositories',
  'components',
  'hooks',
  'utils',
  'contexts',
  'constants',
  'modules',
  'expo-widgets',
  'node_modules',
  'react-native',
  'expo',
  'app',
  'index',
  'dist',
  'build',
  'assets',
  'vendor',
  'hermes',
  'bundle',
]);

function safeCodeFramePath(value: string): string | undefined {
  const path = value.replace(/\\/g, '/').split('/').filter(Boolean).slice(-5);
  const filename = path[path.length - 1];
  if (
    ['index.android.bundle', 'index.ios.bundle', 'main.jsbundle', 'application.bundle'].includes(
      filename,
    )
  ) {
    return filename;
  }
  if (path.length < 2 || path.some(part => !/^[A-Za-z0-9_.@-]{1,80}$/.test(part))) return undefined;
  if (!path.slice(0, -1).some(part => SAFE_CODE_DIRECTORIES.has(part))) return undefined;
  // Preserve frame coordinates while excluding arbitrary source file names.
  return 'application.bundle';
}

function safeCodeFrameFunction(value?: string): string {
  if (!value) return 'anonymous';
  const name = value.replace(/\s*\[as\s+[^\]]+\]/g, '');
  return SAFE_CODE_FUNCTIONS.has(name) ? name : 'application';
}

const SAFE_CODE_FUNCTIONS = new Set([
  'render',
  'commitHookEffectListMount',
  'commitPassiveMountOnFiber',
  'performSyncWorkOnRoot',
  'performWorkOnRoot',
  'dispatchEvent',
  'onPress',
  'onSubmit',
  'useEffect',
  'useMemo',
  'useCallback',
  'fetch',
  'async',
  'Promise.all',
  'anonymous',
  'run',
  'execute',
]);

export function safeDiagnosticError(error: unknown): Error {
  const source = error instanceof Error ? error : undefined;
  const safe = new Error('Application error');
  safe.name = safeErrorName(source?.name);
  const frames = safeStackFrames(source?.stack);
  if (frames) safe.stack = `${safe.name}: Application error\n${frames}`;
  return safe;
}

const SAFE_LOG_SITES = new Set([
  'Analytics',
  'AppReadyProvider',
  'LaunchCoordinator',
  'WorkplaceTransition',
  'Bootstrap',
  'ForegroundMaintenance',
  'RestorePublication',
  'IntegrityMaintenance',
  'SnapshotService',
  'useWidgetSync',
  'JournalList',
  'JournalQueryRepository',
  'JournalBalanceReview',
  'JournalEnrichmentQueries',
  'JournalSaveHelpers',
  'TransactionInboxRepository',
  'SmsService',
  'SmsSyncPipeline',
  'SmsAutoPostAnalyzer',
  'BudgetReadService',
  'BudgetWriteService',
  'BudgetCumulativeChartService',
  'AccountHierarchyCommand',
  'ExchangeRateService',
  'InsightService',
  'Hub',
  'Onboarding',
  'CashClarity',
  'AppLockEngine',
  'AppLockInterceptor',
  'Fonts',
  'SharingService',
  'UIProvider',
  'Splash',
  'Performance',
  'Trace',
  'DataManagement',
  'FactoryReset',
  'WorkplaceService',
  'Database',
  'ReactiveDataService',
  'ErrorBoundary',
  'useVoiceJournalParse',
  'TransactionQueryRepository',
  'SimulationDataPrefetcher',
]);

export function sanitizeLogMessage(message: unknown): string {
  if (message instanceof Error) return `${safeErrorName(message.name)}: Application error`;
  const text = typeof message === 'string' ? message : '';
  const trace = text.match(/^\[Trace\]\s+([A-Za-z][A-Za-z0-9_.]+):\s+(\d+(?:\.\d+)?)ms$/);
  if (trace) return `[Trace] ${trace[1]}: ${trace[2]}ms`;
  const performance = text.match(
    /^\[Performance\]\s+([A-Za-z][A-Za-z0-9_. ]{0,40}):\s+(\d+(?:\.\d+)?)ms(?:\s+\(Cold: (true|false)\))?$/,
  );
  if (performance) {
    return `[Performance] ${performance[1]}: ${performance[2]}ms${performance[3] ? ` (Cold: ${performance[3]})` : ''}`;
  }
  const site = text.match(/^\[([A-Za-z][A-Za-z0-9]*)\]/)?.[1];
  if (site && SAFE_LOG_SITES.has(site)) return `[${site}] Diagnostic event`;
  return 'Diagnostic event';
}

const SAFE_DIAGNOSTIC_CODES = new Set([
  'E_ABORT',
  'E_CANCELLED',
  'E_TIMEOUT',
  'E_NETWORK',
  'E_PERMISSION',
  'E_NOT_FOUND',
  'E_INVALID_STATE',
  'E_VALIDATION',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
  'SQLITE_BUSY',
  'SQLITE_CONSTRAINT',
  'SQLITE_CORRUPT',
]);

const SAFE_OPERATIONS = new Set([
  'create',
  'update',
  'delete',
  'restore',
  'reset',
  'import',
  'export',
  'save',
  'load',
  'publish',
  'rebuild',
  'sync',
  'scan',
  'fetch',
  'validate',
  'cleanup',
  'initialize',
  'switch',
  'revert',
  'post',
  'dismiss',
  'retry',
  'navigation',
  'bootstrap',
]);

export function sanitizeLogContext(
  context?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const result: Record<string, unknown> = {};
  for (const key of [
    'traceId',
    'operation',
    'code',
    'errorName',
    'durationMs',
    'duration',
    'count',
  ]) {
    const value = context[key];
    if (key === 'traceId' && typeof value === 'string' && /^[a-f0-9-]{16,64}$/i.test(value)) {
      result[key] = value;
    } else if (key === 'operation' && typeof value === 'string' && SAFE_OPERATIONS.has(value)) {
      result.operation = value;
    } else if (key === 'code' && typeof value === 'string' && SAFE_DIAGNOSTIC_CODES.has(value)) {
      result.code = value;
    } else if (key === 'errorName' && value !== undefined) {
      result.errorName = safeErrorName(value);
    } else if (
      ['durationMs', 'duration', 'count'].includes(key) &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0
    ) {
      result[key] = value;
    }
  }
  if (context.error instanceof Error) result.error = { name: safeErrorName(context.error.name) };
  return Object.keys(result).length ? result : undefined;
}

function safeSentryTransactionName(value?: string): string | undefined {
  if (!value) return undefined;
  const withoutQuery = value.split(/[?#]/, 1)[0];
  const segments = withoutQuery.split('/').filter(Boolean);
  if (!segments.length) return '/';
  if (
    segments.some(
      segment => !SAFE_SCREEN_SEGMENTS.has(segment) && !/^\[[A-Za-z][A-Za-z0-9_]*\]$/.test(segment),
    )
  ) {
    return 'navigation';
  }
  return `/${segments.map(segment => (/^\[/.test(segment) ? '[id]' : segment)).join('/')}`;
}

export function sanitizeSentryErrorEvent(event: ErrorEvent): ErrorEvent {
  const timestamp = finiteNonNegative(event.timestamp);
  const sanitized = {
    event_id: safeHexId(event.event_id, 32),
    timestamp,
    platform:
      event.platform === 'javascript' || event.platform === 'native' ? event.platform : undefined,
    level: ['fatal', 'error', 'warning', 'info', 'debug', 'log'].includes(String(event.level))
      ? event.level
      : undefined,
    logger: event.logger === 'javascript' || event.logger === 'native' ? event.logger : undefined,
    environment:
      event.environment === 'production' || event.environment === 'development'
        ? event.environment
        : undefined,
    release: safeRelease(event.release),
    dist: safeBuild(event.dist),
    transaction: safeSentryTransactionName(event.transaction),
    user: safeUserId(event.user?.id) ? { id: event.user?.id } : undefined,
    contexts: sanitizeSentryContexts(event.contexts),
    tags: sanitizeSentryTags(event.tags),
    breadcrumbs: event.breadcrumbs?.map(sanitizeSentryBreadcrumb),
    exception: event.exception?.values
      ? {
          values: event.exception.values.slice(0, 5).map(value => ({
            type: safeErrorName(value.type),
            value: 'Application error',
            stacktrace: value.stacktrace?.frames
              ? {
                  frames: value.stacktrace.frames.slice(-20).map(frame => ({
                    filename: safeCodeFramePath(String(frame.filename ?? '')),
                    function: safeCodeFrameFunction(frame.function),
                    lineno: finiteInteger(frame.lineno),
                    colno: finiteInteger(frame.colno),
                    in_app: typeof frame.in_app === 'boolean' ? frame.in_app : undefined,
                  })),
                }
              : undefined,
          })),
        }
      : undefined,
  };
  return sanitized as ErrorEvent;
}

const SAFE_BREADCRUMB_TYPES = new Set(['default', 'navigation', 'http', 'user', 'system', 'error']);
const SAFE_BREADCRUMB_CATEGORIES = new Set([
  'app',
  'navigation',
  'ui.click',
  'ui.lifecycle',
  'console',
  'http',
  'xhr',
  'fetch',
  'transaction',
]);

export function sanitizeSentryBreadcrumb<
  T extends { timestamp?: number; type?: string; category?: string; level?: string },
>(crumb: T): T {
  return {
    timestamp: finiteNonNegative(crumb.timestamp),
    type: crumb.type && SAFE_BREADCRUMB_TYPES.has(crumb.type) ? crumb.type : 'default',
    category:
      crumb.category && SAFE_BREADCRUMB_CATEGORIES.has(crumb.category) ? crumb.category : 'app',
    level:
      crumb.level && ['fatal', 'error', 'warning', 'info', 'debug', 'log'].includes(crumb.level)
        ? crumb.level
        : 'info',
  } as T;
}

export function sanitizeSentryTransactionEvent(event: TransactionEvent): TransactionEvent {
  const sanitized = sanitizeSentryErrorEvent(
    event as unknown as ErrorEvent,
  ) as unknown as TransactionEvent;
  sanitized.type = 'transaction';
  sanitized.transaction = safeSentryTransactionName(event.transaction) ?? 'navigation';
  sanitized.spans = event.spans?.slice(0, 200).map(span => ({
    data: {},
    span_id: safeHexId(span.span_id, 16),
    trace_id: safeHexId(span.trace_id, 32),
    parent_span_id: safeHexId(span.parent_span_id, 16),
    start_timestamp: finiteNonNegative(span.start_timestamp),
    timestamp: finiteNonNegative(span.timestamp),
    status: SAFE_SPAN_STATUSES.has(String(span.status)) ? span.status : undefined,
    op: SAFE_SPAN_OPS.has(String(span.op)) ? span.op : 'app.operation',
    description: SAFE_SPAN_OPS.has(String(span.op)) ? span.op : 'app.operation',
  })) as TransactionEvent['spans'];
  return sanitized;
}

const SAFE_SPAN_OPS = new Set([
  'app.operation',
  'navigation',
  'ui.load',
  'ui.render',
  'db.query',
  'http.client',
  'function',
]);
const SAFE_SPAN_STATUSES = new Set([
  'ok',
  'unknown',
  'deadline_exceeded',
  'unauthenticated',
  'permission_denied',
  'not_found',
  'aborted',
  'unavailable',
  'internal_error',
]);

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function safeHexId(value: unknown, length: number): string | undefined {
  return typeof value === 'string' && new RegExp(`^[a-f\\d]{${length}}$`, 'i').test(value)
    ? value
    : undefined;
}

function safeUserId(value: unknown): boolean {
  return safeAnalyticsIdentity(value) !== 'anonymous';
}

function safeRelease(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^\d{1,4}(?:\.\d{1,4}){0,3}(?:[-+][A-Za-z0-9.-]{1,20})?$/.test(value)
    ? value
    : undefined;
}

function safeBuild(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{1,8}$/.test(value) ? value : undefined;
}

function sanitizeSentryContexts(contexts: ErrorEvent['contexts']): ErrorEvent['contexts'] {
  if (!contexts) return undefined;
  const app = contexts.app as Record<string, unknown> | undefined;
  const device = contexts.device as Record<string, unknown> | undefined;
  const osName = device?.family ?? device?.os ?? device?.name;
  const safeOs = ['iOS', 'Android', 'Web'].includes(String(osName)) ? String(osName) : undefined;
  const result: NonNullable<ErrorEvent['contexts']> = {};
  if (app) {
    const version = safeVersion(app.app_version);
    const build = safeBuild(app.app_build);
    if (version || build) result.app = { app_version: version, app_build: build };
  }
  if (device && safeOs) {
    const osVersion = safeVersion(device.os_version);
    result.device = { family: safeOs, os: safeOs, os_version: osVersion };
  }
  return Object.keys(result).length ? result : undefined;
}

function safeVersion(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^\d{1,4}(?:\.\d{1,4}){0,3}(?:[-+][A-Za-z0-9.-]{1,20})?$/.test(value)
    ? value
    : undefined;
}

function sanitizeSentryTags(tags: ErrorEvent['tags']): ErrorEvent['tags'] {
  if (!tags) return undefined;
  const result: Record<string, string> = {};
  const environment = tags.environment;
  if (environment === 'production' || environment === 'development')
    result.environment = environment;
  const variant = tags['app.variant'];
  if (variant === 'production' || variant === 'development' || variant === 'preview')
    result['app.variant'] = variant;
  const build = safeBuild(tags['app.build']);
  if (build) result['app.build'] = build;
  return Object.keys(result).length ? result : undefined;
}
