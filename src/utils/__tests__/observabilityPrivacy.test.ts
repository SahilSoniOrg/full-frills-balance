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
  it('allows only finite analytics enums and derives feature/action from the event name', () => {
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
                  filename: `src/${PRIVATE_MARKER}.tsx`,
                  function: PRIVATE_MARKER,
                  lineno: 12,
                  colno: 7,
                  data: { marker: PRIVATE_MARKER },
                },
              ],
            },
          },
        ],
      },
    } as unknown as ErrorEvent;

    const sanitized = sanitizeSentryErrorEvent(event);
    expect(JSON.stringify(sanitized)).not.toContain(PRIVATE_MARKER);
    expect(sanitized.contexts?.app).toEqual({ app_version: '1.2.3', app_build: undefined });
    expect(sanitized.exception?.values?.[0]?.type).toBe('ApplicationError');
    expect(sanitized.exception?.values?.[0]?.value).toBe('Application error');
    expect(sanitized.breadcrumbs?.[0]).toEqual({
      timestamp: 12,
      type: 'default',
      category: 'app',
      level: 'info',
    });
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
      contexts: { private: { marker: PRIVATE_MARKER } },
    } as unknown as TransactionEvent;
    const sanitized = sanitizeSentryTransactionEvent(event);
    expect(JSON.stringify(sanitized)).not.toContain(PRIVATE_MARKER);
    expect(sanitized.spans?.[0]).toMatchObject({
      start_timestamp: 1,
      timestamp: 2,
      op: 'app.operation',
      description: 'app.operation',
      data: {},
    });
  });
});
