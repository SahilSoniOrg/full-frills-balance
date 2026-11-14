import { safeErrorName } from './primitives';

function safeStackFrames(stack?: string): string | undefined {
  if (!stack) return undefined;
  const frames = stack
    .split('\n')
    .slice(1)
    .map(line => {
      const match = line.match(/^\s*at\s+(?:(.*?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
      if (!match) return undefined;
      const file = safeCodeFramePath(match[2].replace(/^address at /, ''));
      if (!file) return undefined;
      const fn = safeCodeFrameFunction(match[1]) ?? 'anonymous';
      return `    at ${fn} (${file}:${match[3]}:${match[4]})`;
    })
    .filter((frame): frame is string => !!frame)
    .slice(0, 20);
  return frames.length ? frames.join('\n') : undefined;
}

const APP_CODE_ROOTS = new Set(['src', 'app', 'modules', 'node_modules']);

const CODE_PATH_SEGMENT = /^[A-Za-z0-9_.@()[\]+-]{1,100}$/;

const CODE_FILE = /\.(?:[cm]?[jt]sx?|bundle|jsbundle|hbc)$/;

/**
 * Keeps bundle and repository-relative source paths (for grouping and source maps) while
 * dropping device/host prefixes, query strings and anything that is not a code path.
 */
export function safeCodeFramePath(value: string): string | undefined {
  if (value === '[native code]' || value === 'native') return value;
  const withoutQuery = value.replace(/\\/g, '/').split(/[?#]/, 1)[0];
  const appScheme = withoutQuery.startsWith('app:///') ? 'app:///' : '';
  const segments = withoutQuery
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
    .split('/')
    .filter(Boolean);
  const rootIndex = segments.findIndex(segment => APP_CODE_ROOTS.has(segment));
  const filename = segments[segments.length - 1];
  const kept =
    rootIndex >= 0
      ? segments.slice(rootIndex)
      : filename && CODE_FILE.test(filename)
        ? [filename]
        : [];
  if (!kept.length || kept.length > 12 || kept.some(part => !CODE_PATH_SEGMENT.test(part))) {
    return undefined;
  }
  return `${appScheme}${kept.join('/')}`;
}

const SAFE_LOG_SITES = new Set([
  'Analytics',
  'LaunchCoordinator',
  'WorkplaceTransition',
  'Bootstrap',
  'ForegroundMaintenance',
  'RestorePublication',
  'IntegrityMaintenance',
  'SnapshotService',
  'useWidgetSync',
  'WidgetProjection',
  'JournalList',
  'JournalBalanceReview',
  'JournalEnrichmentQueries',
  'BudgetReadService',
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
  'WorkplaceService',
  'ReactiveDataService',
  'useVoiceJournalParse',
  'SimulationDataPrefetcher',
]);

export function safeCodeFrameFunction(value?: string): string | undefined {
  if (!value) return undefined;
  const name = value.replace(/\s*\[as\s+[^\]]+\]/g, '').trim();
  return /^[A-Za-z_$?<][\w$.<>?-]{0,127}$/.test(name) ? name : '?';
}

export function safeDiagnosticError(error: unknown): Error {
  const source = error instanceof Error ? error : undefined;
  const safe = new Error('Application error');
  safe.name = safeErrorName(source?.name);
  const frames = safeStackFrames(source?.stack);
  if (frames) safe.stack = `${safe.name}: Application error\n${frames}`;
  return safe;
}

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
