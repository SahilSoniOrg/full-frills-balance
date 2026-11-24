import { COMMON_CURRENCIES } from '@/src/constants/currency-definitions';
import { FontIds, ThemeIds } from '@/src/constants/design-tokens';
import { sanitizeScreenName } from './routes';
import {
  FEATURE_EVENT_CATALOG,
  type AnalyticsPropertyKind,
} from '@/src/services/analytics/featureEventCatalog';
import { AccountType, PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { safeVersion, safeErrorName } from './primitives';

type EventSchema = Record<string, AnalyticsPropertyKind>;

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
  cadence: new Set(['daily', 'weekly', 'monthly', 'never']),
  interval: new Set(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']),
  choice: new Set(['fix_now', 'later', 'dismissed']),
  source: new Set(['manual', 'system', 'import', 'sms', 'restore', 'cleanup', 'user', 'widget']),
  channel: new Set(['sms', 'email', 'voice']),
  format: new Set(['csv', 'json', 'pdf', 'zip', 'text', 'ofx', 'qif']),
  kind: new Set(['expense', 'income', 'transfer']),
  provenance: new Set(['discovered', 'selected_message', 'manual']),
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
    'background',
  ]),
  end_reason: new Set(['inactivity', 'background']),
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
    'start',
    'resume',
    'restart',
    'complete',
    'defer',
    'skip',
    'continue',
    'retry',
    'save',
    'cancel',
  ]),
  intent: new Set(['first_run', 'add_workplace']),
  context: new Set([
    'unregistered_device',
    'registered_empty_device',
    'workplace_picker',
    'existing_workplace_entry',
  ]),
  step: new Set([
    'welcome',
    'currency',
    'accounts',
    'income',
    'payments',
    'monthly_limits',
    'result',
  ]),
  error_code: new Set([
    'amount_invalid',
    'missing_spendable_account',
    'income_invalid',
    'payment_invalid',
    'budget_invalid',
    'dependency_unresolved',
    'required_field_missing',
    'save_failed',
    'open_failed',
    'unknown',
  ]),
  outcome: new Set([
    'success',
    'failure',
    'retry',
    'cancelled',
    'skipped',
    'viewed',
    'ready',
    'zero',
    'positive',
    'negative',
    'unknown',
    'saved',
    'opened',
  ]),
  interactionType: new Set(['press', 'select', 'zoom', 'scroll', 'toggle']),
  chartName: new Set(['cash_flow', 'spending', 'income', 'net_worth', 'safe_to_spend']),
  unit: new Set(['ms', 's', 'count']),
  conversion_event: new Set([
    'onboarding_completed',
    'first_transaction_created',
    'transaction_created',
  ]),
  engagement_type: new Set(['session', 'screen', 'feature']),
  entity_type: new Set(['journal', 'budget', 'account', 'planned_payment']),
  issueType: new Set(['missing_account', 'unbalanced_journal', 'missing_currency']),
  table: new Set(['journals', 'accounts', 'budgets', 'planned_payments', 'transaction_inbox']),
  screen_type: new Set(['modal', 'tab', 'screen']),
  flow: new Set(['onboarding', 'journal', 'account', 'budget', 'settings']),
  entrypoint: new Set([
    'dashboard',
    'journal',
    'accounts',
    'settings',
    'notification',
    'widget',
    'bottom_action',
    'startup_prompt',
    'balance_audit',
  ]),
  target: new Set([
    'journal',
    'account',
    'budget',
    'planned_payment',
    'settings',
    'journal_entry',
    'journal_balance_review',
  ]),
  icon: new Set(['wallet', 'bank', 'cash', 'credit-card', 'home', 'briefcase', 'chart']),
};

const CURRENCY_CODES = new Set(COMMON_CURRENCIES.map(currency => currency.code));

const ACCOUNT_TYPES = new Set(Object.values(AccountType));

const PAYMENT_INTERVALS = new Set(Object.values(PlannedPaymentInterval));

const PAYMENT_STATUSES = new Set(Object.values(PlannedPaymentStatus));

const THEME_IDS = new Set(Object.values(ThemeIds));

const FONT_IDS = new Set(Object.values(FontIds));

const SAFE_TO_SPEND_SECTIONS = new Set(['assets', 'income', 'committed', 'debts']);

const SAFE_TO_SPEND_LEGENDS = new Set(['safe', 'committed', 'debts']);

const ENUM_VALUES_WITH_DESIGN_TOKENS: Record<string, ReadonlySet<string>> = {
  ...ENUM_VALUES,
  themeId: THEME_IDS,
  fontId: FONT_IDS,
};

const THEME_PREFERENCES = new Set(['light', 'dark', 'system']);

const MAX_ANALYTICS_URL_LENGTH = 512;
const MAX_ANALYTICS_PARAMS_LENGTH = 512;
const SENSITIVE_QUERY_KEY =
  /(?:auth|token|secret|password|passwd|pwd|api[_-]?key|session|signature|sig|code|email|phone)/i;
const SAFE_URL_CHARACTERS = /^[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+$/;
const SAFE_PARAM_KEY = /^[A-Za-z0-9_.-]{1,64}$/;
const SAFE_PARAM_VALUE = /^[a-z0-9._~:+=@/\[\]-]*$/;

function decodeQueryComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function redactQueryPair(pair: string): string | null {
  if (!pair) return null;
  const separator = pair.indexOf('=');
  if (separator <= 0) return null;
  const rawKey = pair.slice(0, separator);
  const rawValue = pair.slice(separator + 1);
  const key = decodeQueryComponent(rawKey);
  if (!SAFE_PARAM_KEY.test(key)) return null;
  if (SENSITIVE_QUERY_KEY.test(key)) return `${rawKey}=[redacted]`;
  const value = decodeQueryComponent(rawValue);
  if (value.length > 64 || !SAFE_PARAM_VALUE.test(value)) return null;
  return pair;
}

function sanitizeQueryString(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ANALYTICS_PARAMS_LENGTH ||
    value.includes('#') ||
    /\s/.test(value)
  )
    return null;
  const pairs = value.split('&').map(redactQueryPair);
  if (pairs.some(pair => pair === null)) return null;
  return pairs.join('&');
}

function sanitizeAnalyticsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_ANALYTICS_URL_LENGTH) return null;
  const withoutFragment = value.split('#')[0];
  if (!/^(?:https?:\/\/[^\s/?#]+)?\//.test(withoutFragment)) return null;
  if (!SAFE_URL_CHARACTERS.test(withoutFragment)) return null;
  const queryStart = withoutFragment.indexOf('?');
  if (queryStart === -1) return withoutFragment;
  const query = sanitizeQueryString(withoutFragment.slice(queryStart + 1));
  if (query === null) return null;
  return `${withoutFragment.slice(0, queryStart)}?${query}`;
}

const FEATURE_FIELD_ENUMS: Record<string, Readonly<Record<string, ReadonlySet<string>>>> = {
  account: { account_type: ACCOUNT_TYPES, type: ACCOUNT_TYPES },
  journal: {
    type: new Set(['create', 'update']),
    mode: new Set(['simple', 'advanced', 'import']),
  },
  planned_payment: { status: PAYMENT_STATUSES, interval_type: PAYMENT_INTERVALS },
  settings: {
    theme_id: THEME_IDS,
    font_id: FONT_IDS,
    preference: THEME_PREFERENCES,
    cadence: ENUM_VALUES.cadence,
  },
  safe_to_spend: {
    section: SAFE_TO_SPEND_SECTIONS,
    item: SAFE_TO_SPEND_LEGENDS,
    slice: SAFE_TO_SPEND_LEGENDS,
    quality: new Set(['ready', 'stale', 'unavailable']),
  },
  sms: {
    mode: new Set(['refresh', 'scan_older']),
    channel: ENUM_VALUES.channel,
  },
  gmail: {
    status: ENUM_VALUES.status,
  },
  transaction_capture: {
    channel: ENUM_VALUES.channel,
    kind: ENUM_VALUES.kind,
  },
  account_matcher: {
    provenance: ENUM_VALUES.provenance,
  },
};

const ANALYTICS_EVENT_SCHEMAS: Record<string, EventSchema> = {
  app_installed: {
    version: 'version',
    app_version: 'version',
    build: 'version',
    app_build: 'version',
    install_age_ms: 'duration',
  },
  app_opened: {
    version: 'version',
    app_version: 'version',
    build: 'version',
    app_build: 'version',
  },
  privacy_policy_acknowledged: { policy_version: 'version' },
  onboarding_complete: {},
  onboarding_flow_started: {
    flow_version: 'version',
    intent: 'token',
    context: 'token',
    resumed: 'boolean',
  },
  onboarding_flow_resumed: {
    flow_version: 'version',
    intent: 'token',
    context: 'token',
    resumed: 'boolean',
    duration_ms: 'duration',
  },
  onboarding_flow_restarted: {
    flow_version: 'version',
    intent: 'token',
    context: 'token',
    resumed: 'boolean',
    duration_ms: 'duration',
  },
  onboarding_step_viewed: {
    flow_version: 'version',
    intent: 'token',
    context: 'token',
    step: 'token',
    resumed: 'boolean',
    duration_ms: 'duration',
  },
  onboarding_step_completed: {
    flow_version: 'version',
    intent: 'token',
    context: 'token',
    step: 'token',
    action: 'token',
    resumed: 'boolean',
    duration_ms: 'duration',
  },
  onboarding_step_deferred: {
    flow_version: 'version',
    intent: 'token',
    context: 'token',
    step: 'token',
    action: 'token',
    resumed: 'boolean',
    duration_ms: 'duration',
  },
  onboarding_validation_blocked: {
    flow_version: 'version',
    intent: 'token',
    context: 'token',
    step: 'token',
    error_code: 'token',
    resumed: 'boolean',
  },
  onboarding_first_estimate: {
    flow_version: 'version',
    intent: 'token',
    context: 'token',
    resumed: 'boolean',
    duration_ms: 'duration',
  },
  onboarding_result_viewed: {
    flow_version: 'version',
    intent: 'token',
    context: 'token',
    outcome: 'token',
    resumed: 'boolean',
    duration_ms: 'duration',
  },
  onboarding_save_result: {
    flow_version: 'version',
    intent: 'token',
    context: 'token',
    outcome: 'token',
    error_code: 'token',
    resumed: 'boolean',
    duration_ms: 'duration',
  },
  onboarding_dashboard_opened: {
    flow_version: 'version',
    intent: 'token',
    context: 'token',
    outcome: 'token',
    resumed: 'boolean',
    duration_ms: 'duration',
  },
  integrity_issue: { table: 'token', issueType: 'token' },
  journal_balance_checked: { unbalanced_count: 'count', journals_checked: 'count' },
  unbalanced_journals_prompt_answered: { choice: 'token' },
  unbalanced_journals_cleared: { peak_count: 'count', days_open: 'count', source: 'token' },
  factory_reset: {},
  entrypoint_opened: { screen: 'token', entrypoint: 'token' },
  entrypoint_selected: { screen: 'token', entrypoint: 'token', target: 'token' },
  session_start: {},
  session_end: {
    session_duration_ms: 'duration',
    session_duration_min: 'count',
    end_reason: 'token',
  },
  app_backgrounded: {},
  app_foregrounded: {},
  analytics_event_dropped: { event_name: 'token' },
  app_error: { name: 'token' },
  not_found: { url: 'url', params: 'params' },
  app_cold_start: {
    splash_hidden_ms: 'duration',
    splash_hidden_sec: 'duration',
    is_data_hydrated: 'boolean',
  },
  screen_leave: {
    screen: 'token',
    dwell_time_ms: 'duration',
    dwell_time_sec: 'duration',
    next_screen: 'token',
  },
  $screen: {
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

const SAFE_ANALYTICS_EVENT_NAMES = new Set(Object.keys(ANALYTICS_EVENT_SCHEMAS));

const FEATURE_EVENT_SCHEMAS: Record<string, EventSchema> = Object.fromEntries(
  Object.entries(FEATURE_EVENT_CATALOG).map(([feature, definition]) => [
    feature,
    definition.schema,
  ]),
);

const FEATURE_ACTIONS: Record<string, ReadonlySet<string>> = Object.fromEntries(
  Object.entries(FEATURE_EVENT_CATALOG).map(([feature, definition]) => [
    feature,
    new Set(definition.actions),
  ]),
);

export function isAnalyticsEventDeclared(eventName: string): boolean {
  if (SAFE_ANALYTICS_EVENT_NAMES.has(eventName)) return true;
  if (!eventName.startsWith('feature_')) return false;
  const name = eventName.slice('feature_'.length);
  return Object.keys(FEATURE_ACTIONS).some(feature => {
    const prefix = `${feature}_`;
    return name.startsWith(prefix) && FEATURE_ACTIONS[feature].has(name.slice(prefix.length));
  });
}

for (const [feature, schema] of Object.entries(FEATURE_EVENT_SCHEMAS)) {
  for (const key of Object.keys(schema)) {
    if (FEATURE_FIELD_ENUMS[feature]?.[key] || !ENUM_VALUES_WITH_DESIGN_TOKENS[key]) continue;
    FEATURE_FIELD_ENUMS[feature] = {
      ...FEATURE_FIELD_ENUMS[feature],
      [key]: ENUM_VALUES_WITH_DESIGN_TOKENS[key],
    };
  }
}

function validProperty(
  key: string,
  value: unknown,
  kind: AnalyticsPropertyKind,
  _eventName: string,
  featureName?: string,
): value is string | number | boolean {
  if (kind === 'boolean') return typeof value === 'boolean';
  if (kind === 'count' || kind === 'duration') {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }
  if (typeof value !== 'string' || value.length > 64) return false;
  if (key === 'metric') return /^[A-Za-z][A-Za-z0-9_. ]{0,63}$/.test(value);
  if (key === 'event_name' && _eventName === 'analytics_event_dropped')
    return /^[a-z][a-z0-9_]{0,63}$/.test(value);
  if (kind === 'currency') return /^[A-Z]{3}$/.test(value) && CURRENCY_CODES.has(value);
  if (kind === 'version') return safeVersion(value) !== undefined;
  if (['fromId', 'toId'].includes(key)) return safeGeneratedId(value);
  if (featureName) {
    const featureValues = FEATURE_FIELD_ENUMS[featureName]?.[key];
    return featureValues ? featureValues.has(value) : false;
  }
  return ENUM_VALUES_WITH_DESIGN_TOKENS[key]?.has(value) ?? false;
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
    if (kind === 'url' || kind === 'params') {
      const safe = kind === 'url' ? sanitizeAnalyticsUrl(value) : sanitizeQueryString(value);
      if (safe !== null) result[key] = safe;
      continue;
    }
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

const APP_BUILD_VARIANTS = new Set(['production', 'development', 'preview']);

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
    else if (key === '$app_variant' && APP_BUILD_VARIANTS.has(String(value)))
      result[key] = String(value);
    else if (key === '$build_type' && APP_BUILD_VARIANTS.has(String(value)))
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
