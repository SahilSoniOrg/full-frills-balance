import { ANALYTICS_SANITIZE_CASES } from '@/src/testing/analyticsPrivacyFixtures';
import {
  safeDiagnosticError,
  sanitizeAnalyticsProperties,
  sanitizeGlobalAnalyticsProperties,
  sanitizeLogContext,
  sanitizeLogMessage,
  sanitizeSentryBreadcrumb,
  sanitizeSentryErrorEvent,
  sanitizeSentryTransactionEvent,
} from '../observabilityPrivacy';
import type { ErrorEvent, TransactionEvent } from '@sentry/react-native';

const PRIVATE_MARKER = 'PrivateMerchant';

describe('observability privacy boundary', () => {
  it('allows theme tokens from design system enums', () => {
    expect(
      sanitizeAnalyticsProperties('theme_changed', {
        theme: 'light',
        themeId: 'deep-space',
        fontId: 'deep-space',
      }),
    ).toEqual({ theme: 'light', themeId: 'deep-space', fontId: 'deep-space' });
    expect(
      sanitizeAnalyticsProperties('theme_changed', {
        theme: 'light',
        themeId: 'roboto',
        fontId: 'open-sans',
      }),
    ).toEqual({ theme: 'light' });
  });

  it.each(ANALYTICS_SANITIZE_CASES)(
    'sanitizes analytics payload for %s',
    (eventName, input, expected) => {
      expect(sanitizeAnalyticsProperties(eventName, input)).toEqual(expected);
    },
  );

  it('redacts private markers from declared analytics events', () => {
    expect(
      sanitizeAnalyticsProperties('account_created', {
        type: PRIVATE_MARKER,
        currency: 'USD',
        malicious: PRIVATE_MARKER,
      }),
    ).toEqual({ currency: 'USD' });

    expect(sanitizeAnalyticsProperties('app_error', { name: PRIVATE_MARKER })).toEqual({
      name: 'ApplicationError',
    });
    expect(
      sanitizeAnalyticsProperties('feature_account_create', {
        feature: PRIVATE_MARKER,
        action: PRIVATE_MARKER,
        type: PRIVATE_MARKER,
        count: 2,
      }),
    ).toEqual({ feature: 'account', action: 'create', count: 2 });
    expect(
      sanitizeAnalyticsProperties('user_screen_view', {
        screen: '/PrivateMerchant',
      }),
    ).toEqual({ screen: 'other' });
  });

  it('keeps only approved app context and pseudonymous generated workplace IDs', () => {
    expect(
      sanitizeGlobalAnalyticsProperties({
        $os_name: PRIVATE_MARKER,
        $app_version: 'PrivateMerchant',
        $active_workplace_id: PRIVATE_MARKER,
        active_currency: 'USD',
      }),
    ).toEqual({ active_currency: 'USD' });
    expect(
      sanitizeGlobalAnalyticsProperties({
        $os_name: 999,
        $app_variant: 999,
        active_currency: 999,
        $db_schema_version: 4,
        $is_dev: false,
      }),
    ).toEqual({ $db_schema_version: 4, $is_dev: false });
  });

  it('rejects arbitrary free text in version-shaped analytics fields', () => {
    expect(
      sanitizeAnalyticsProperties('app_opened', {
        version: PRIVATE_MARKER,
        app_version: '2.4.1',
        build: PRIVATE_MARKER,
      }),
    ).toEqual({ app_version: '2.4.1' });
    expect(
      sanitizeAnalyticsProperties('privacy_policy_acknowledged', {
        policy_version: PRIVATE_MARKER,
      }),
    ).toEqual({});
  });

  it('strips arbitrary log text and validates context values before buffering', () => {
    expect(sanitizeLogMessage(`[SharingService] ${PRIVATE_MARKER} failed for $450`)).toBe(
      '[SharingService] Diagnostic event',
    );
    expect(
      sanitizeLogContext({
        operation: PRIVATE_MARKER,
        code: PRIVATE_MARKER,
        traceId: PRIVATE_MARKER,
        durationMs: 17,
        nested: { marker: PRIVATE_MARKER },
      }),
    ).toEqual({ durationMs: 17 });
    expect(
      sanitizeLogContext({
        operation: 999,
        code: 999,
        traceId: 999,
        duration: '18',
        count: 999,
      }),
    ).toEqual({ count: 999 });
    const error = safeDiagnosticError(new Error(`${PRIVATE_MARKER} ${PRIVATE_MARKER}`));
    expect(error.message).not.toContain(PRIVATE_MARKER);
    expect(error.name).toBe('Error');
  });

  it('reconstructs Sentry errors, contexts, frames, and breadcrumbs from approved fields', () => {
    const event = {
      event_id: '0123456789abcdef0123456789abcdef',
      timestamp: 1234,
      platform: 'javascript',
      level: 'error',
      message: PRIVATE_MARKER,
      extra: { nested: PRIVATE_MARKER },
      request: { url: `https://${PRIVATE_MARKER}.example` },
      contexts: {
        app: { app_version: '1.2.3', arbitrary: PRIVATE_MARKER },
        device: { os: PRIVATE_MARKER, os_version: '1.2', model: PRIVATE_MARKER },
        private: { marker: PRIVATE_MARKER },
      },
      tags: { environment: PRIVATE_MARKER, arbitrary: PRIVATE_MARKER },
      breadcrumbs: [
        {
          timestamp: 12,
          type: PRIVATE_MARKER,
          category: PRIVATE_MARKER,
          message: PRIVATE_MARKER,
          data: { marker: PRIVATE_MARKER },
        },
      ],
      exception: {
        values: [
          {
            type: PRIVATE_MARKER,
            value: PRIVATE_MARKER,
            stacktrace: {
              frames: [
                {
                  filename: `/var/mobile/Documents/${PRIVATE_MARKER} statement.pdf`,
                  function: `Paid ${PRIVATE_MARKER} 450`,
                  lineno: 12,
                  colno: 7,
                  vars: { marker: PRIVATE_MARKER },
                  context_line: PRIVATE_MARKER,
                  data: { marker: PRIVATE_MARKER },
                },
              ],
            },
            mechanism: { type: 'onerror', handled: false, data: { marker: PRIVATE_MARKER } },
          },
        ],
      },
    } as unknown as ErrorEvent;

    const sanitized = sanitizeSentryErrorEvent(event);
    expect(JSON.stringify(sanitized)).not.toContain(PRIVATE_MARKER);
    expect(sanitized.contexts?.app).toEqual({ app_version: '1.2.3', app_build: undefined });
    expect(sanitized.exception?.values?.[0]?.type).toBe('ApplicationError');
    expect(sanitized.exception?.values?.[0]?.value).toBe('Application error');
    expect(sanitized.exception?.values?.[0]?.mechanism).toEqual({
      type: 'onerror',
      handled: false,
    });
    expect(sanitized.exception?.values?.[0]?.stacktrace?.frames?.[0]).toEqual({
      filename: undefined,
      function: '?',
      lineno: 12,
      colno: 7,
      in_app: undefined,
    });
    expect(sanitized.breadcrumbs?.[0]).toEqual({
      timestamp: 12,
      type: 'default',
      category: 'app',
      level: 'info',
    });
  });

  it('keeps code identifiers needed for grouping and source maps', () => {
    const debugId = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e';
    const sanitized = sanitizeSentryErrorEvent({
      sdk: { name: 'sentry.javascript.react-native', version: '7.11.0', packages: [] },
      debug_meta: {
        images: [
          { type: 'sourcemap', code_file: 'app:///index.android.bundle', debug_id: debugId },
          { type: 'macho', code_file: `/private/${PRIVATE_MARKER}`, debug_id: debugId },
        ],
      },
      exception: {
        values: [
          {
            type: 'DatabaseConnectionError',
            value: `${PRIVATE_MARKER} not found`,
            stacktrace: {
              frames: [
                {
                  filename: 'app:///index.android.bundle',
                  function: 'Object.createBudget [as create]',
                  lineno: 1,
                  colno: 48213,
                  in_app: true,
                },
                {
                  filename:
                    '/Users/dev/full-frills-balance/src/services/budget/budgetWriteService.ts',
                  function: 'BudgetWriteService.create',
                  lineno: 20,
                  colno: 4,
                  in_app: true,
                },
                {
                  filename:
                    'http://192.168.1.5:8081/node_modules/react-native/index.js?platform=ios',
                  function: undefined,
                  lineno: 3,
                  colno: 9,
                  in_app: false,
                },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent);

    expect(JSON.stringify(sanitized)).not.toContain(PRIVATE_MARKER);
    expect(sanitized.sdk).toEqual({ name: 'sentry.javascript.react-native', version: '7.11.0' });
    expect(sanitized.debug_meta).toEqual({
      images: [{ type: 'sourcemap', code_file: 'app:///index.android.bundle', debug_id: debugId }],
    });
    const exception = sanitized.exception?.values?.[0];
    expect(exception?.type).toBe('DatabaseConnectionError');
    expect(exception?.value).toBe('Application error');
    expect(exception?.stacktrace?.frames).toEqual([
      {
        filename: 'app:///index.android.bundle',
        function: 'Object.createBudget',
        lineno: 1,
        colno: 48213,
        in_app: true,
      },
      {
        filename: 'src/services/budget/budgetWriteService.ts',
        function: 'BudgetWriteService.create',
        lineno: 20,
        colno: 4,
        in_app: true,
      },
      {
        filename: 'node_modules/react-native/index.js',
        function: undefined,
        lineno: 3,
        colno: 9,
        in_app: false,
      },
    ]);
  });

  it('rebuilds diagnostic error stacks with code frames but without the message', () => {
    const error = new TypeError(`${PRIVATE_MARKER} balance 450`);
    error.stack = [
      `TypeError: ${PRIVATE_MARKER} balance 450`,
      '    at BudgetWriteService.create (/Users/dev/full-frills-balance/src/services/budget/budgetWriteService.ts:20:4)',
      '    at anonymous (address at index.android.bundle:1:48213)',
    ].join('\n');
    const safe = safeDiagnosticError(error);
    expect(`${safe.message}${safe.stack}`).not.toContain(PRIVATE_MARKER);
    expect(safe.stack).toBe(
      [
        'TypeError: Application error',
        '    at BudgetWriteService.create (src/services/budget/budgetWriteService.ts:20:4)',
        '    at anonymous (index.android.bundle:1:48213)',
      ].join('\n'),
    );
  });

  it('removes private breadcrumb and span payloads while retaining safe timing', () => {
    expect(
      sanitizeSentryBreadcrumb({
        timestamp: 100,
        type: PRIVATE_MARKER,
        category: PRIVATE_MARKER,
        level: 'error',
        message: PRIVATE_MARKER,
      }),
    ).toEqual({ timestamp: 100, type: 'default', category: 'app', level: 'error' });

    const event = {
      type: 'transaction',
      transaction: '/settings',
      start_timestamp: 100,
      timestamp: 102,
      spans: [
        {
          span_id: '0123456789abcdef',
          trace_id: '0123456789abcdef0123456789abcdef',
          start_timestamp: 1,
          timestamp: 2,
          op: PRIVATE_MARKER,
          description: PRIVATE_MARKER,
          data: { marker: PRIVATE_MARKER },
          tags: { marker: PRIVATE_MARKER },
        },
      ],
      contexts: {
        trace: {
          trace_id: '0123456789abcdef0123456789abcdef',
          span_id: 'fedcba9876543210',
          parent_span_id: 'abcdef0123456789',
          op: 'navigation',
          status: 'ok',
          description: PRIVATE_MARKER,
          data: { marker: PRIVATE_MARKER },
        },
        private: { marker: PRIVATE_MARKER },
      },
    } as unknown as TransactionEvent;
    const sanitized = sanitizeSentryTransactionEvent(event);
    expect(JSON.stringify(sanitized)).not.toContain(PRIVATE_MARKER);
    expect(sanitized).toMatchObject({
      type: 'transaction',
      transaction: '/settings',
      start_timestamp: 100,
      timestamp: 102,
    });
    expect(sanitized.contexts?.trace).toEqual({
      trace_id: '0123456789abcdef0123456789abcdef',
      span_id: 'fedcba9876543210',
      parent_span_id: 'abcdef0123456789',
      op: 'navigation',
      status: 'ok',
    });
    expect(sanitized.spans?.[0]).toMatchObject({
      start_timestamp: 1,
      timestamp: 2,
      op: 'app.operation',
      description: 'app.operation',
      data: {},
    });
  });

  it('rejects invalid trace identities and timestamps from transactions', () => {
    const sanitized = sanitizeSentryTransactionEvent({
      type: 'transaction',
      transaction: '/settings',
      start_timestamp: Number.NaN,
      timestamp: -1,
      contexts: {
        trace: { trace_id: PRIVATE_MARKER, span_id: '0123456789abcdef' },
      },
    });
    expect(sanitized.start_timestamp).toBeUndefined();
    expect(sanitized.timestamp).toBeUndefined();
    expect(sanitized.contexts?.trace).toBeUndefined();
  });
});
