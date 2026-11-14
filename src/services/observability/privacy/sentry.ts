import type { ErrorEvent, TransactionEvent } from '@sentry/react-native';
import { SAFE_SCREEN_SEGMENTS } from './routes';
import { safeVersion, safeErrorName, safeAnalyticsIdentity } from './primitives';
import { safeCodeFramePath, safeCodeFrameFunction } from './diagnostics';

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

function sanitizeSentryEnvelope(event: ErrorEvent | TransactionEvent) {
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
      event.environment === 'production' ||
      event.environment === 'development' ||
      event.environment === 'preview'
        ? event.environment
        : undefined,
    release: safeVersion(event.release),
    dist: safeBuild(event.dist),
    transaction: safeSentryTransactionName(event.transaction),
    user: safeUserId(event.user?.id) ? { id: event.user?.id } : undefined,
    contexts: sanitizeSentryContexts(event.contexts),
    tags: sanitizeSentryTags(event.tags),
    breadcrumbs: event.breadcrumbs?.map(sanitizeSentryBreadcrumb),
    sdk: sanitizeSentrySdk(event.sdk),
    debug_meta: sanitizeSentryDebugMeta(event.debug_meta),
  };
  return sanitized;
}

export function sanitizeSentryErrorEvent(event: ErrorEvent): ErrorEvent {
  return {
    ...sanitizeSentryEnvelope(event),
    type: undefined,
    exception: event.exception?.values
      ? {
          values: event.exception.values.slice(0, 5).map(value => ({
            type: safeErrorName(value.type),
            value: 'Application error',
            mechanism: sanitizeSentryMechanism(value.mechanism),
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
  const sanitized: TransactionEvent = {
    ...sanitizeSentryEnvelope(event),
    type: 'transaction',
    start_timestamp: finiteNonNegative(event.start_timestamp),
    transaction: safeSentryTransactionName(event.transaction) ?? 'navigation',
  };
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
  const trace = contexts.trace;
  const traceId = safeHexId(trace?.trace_id, 32);
  const spanId = safeHexId(trace?.span_id, 16);
  if (traceId && spanId) {
    result.trace = {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: safeHexId(trace?.parent_span_id, 16),
      op: SAFE_SPAN_OPS.has(String(trace?.op)) ? trace?.op : 'app.operation',
      status: SAFE_SPAN_STATUSES.has(String(trace?.status)) ? trace?.status : undefined,
    };
  }
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

function sanitizeSentrySdk(sdk: ErrorEvent['sdk']): ErrorEvent['sdk'] {
  if (!sdk || !/^sentry\.[a-z.-]{1,60}$/.test(String(sdk.name))) return undefined;
  return { name: sdk.name, version: safeVersion(sdk.version) ?? '0.0.0' };
}

function sanitizeSentryDebugMeta(meta: ErrorEvent['debug_meta']): ErrorEvent['debug_meta'] {
  const images = meta?.images
    ?.filter(image => image.type === 'sourcemap')
    .map(image => ({
      type: 'sourcemap' as const,
      code_file: safeCodeFramePath(String(image.code_file ?? '')),
      debug_id: safeDebugId(image.debug_id),
    }))
    .filter(
      (image): image is { type: 'sourcemap'; code_file: string; debug_id: string } =>
        !!image.code_file && !!image.debug_id,
    )
    .slice(0, 10);
  return images?.length ? { images } : undefined;
}

function safeDebugId(value: unknown): string | undefined {
  return typeof value === 'string' &&
    /^[a-f\d]{8}-?[a-f\d]{4}-?[a-f\d]{4}-?[a-f\d]{4}-?[a-f\d]{12}$/i.test(value)
    ? value
    : undefined;
}

type SentryMechanism = NonNullable<
  NonNullable<NonNullable<ErrorEvent['exception']>['values']>[number]['mechanism']
>;

function sanitizeSentryMechanism(mechanism?: SentryMechanism): SentryMechanism | undefined {
  if (!mechanism || !/^[A-Za-z][A-Za-z0-9_.]{0,40}$/.test(String(mechanism.type))) {
    return undefined;
  }
  return {
    type: mechanism.type,
    handled: typeof mechanism.handled === 'boolean' ? mechanism.handled : undefined,
  };
}

function sanitizeSentryTags(tags: ErrorEvent['tags']): ErrorEvent['tags'] {
  if (!tags) return undefined;
  const result: Record<string, string> = {};
  const environment = tags.environment;
  if (environment === 'production' || environment === 'development' || environment === 'preview')
    result.environment = environment;
  const variant = tags['app.variant'];
  if (variant === 'production' || variant === 'development' || variant === 'preview')
    result['app.variant'] = variant;
  const build = safeBuild(tags['app.build']);
  if (build) result['app.build'] = build;
  return Object.keys(result).length ? result : undefined;
}
