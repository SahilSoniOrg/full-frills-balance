import * as Sentry from '@sentry/react-native';
import { logger } from '../logger';

const PRIVATE_MARKER = 'PrivateMerchant';

describe('logger privacy boundary', () => {
  const internals = logger as unknown as { isDevelopment: boolean };
  const originalDevelopment = internals.isDevelopment;
  let info: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let capture: jest.SpyInstance;

  beforeEach(() => {
    info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    capture = jest.spyOn(Sentry, 'captureException').mockImplementation(() => '');
  });

  afterEach(() => {
    internals.isDevelopment = originalDevelopment;
    jest.restoreAllMocks();
  });

  it('prints original text to the development console but buffers and reports sanitized text', () => {
    internals.isDevelopment = true;
    logger.info(`[SharingService] Shared ${PRIVATE_MARKER} statement`, { note: PRIVATE_MARKER });
    logger.metric('SafeToSpend.recompute', 12);
    logger.error(`[Analytics] Failed for ${PRIVATE_MARKER}`, new Error(`${PRIVATE_MARKER} 450`));

    const consoleOutput = [...info.mock.calls, ...warn.mock.calls].flat().join('\n');
    expect(consoleOutput).toContain(`Shared ${PRIVATE_MARKER} statement`);
    expect(consoleOutput).toContain('SafeToSpend.recompute: 12ms');
    expect(consoleOutput).toContain(`Error: ${PRIVATE_MARKER} 450`);

    expect(logger.getRecentLogs()).not.toContain(PRIVATE_MARKER);
    expect(logger.getRecentLogs()).toContain('[SharingService] Diagnostic event');
    const reported = capture.mock.calls[0][0] as Error;
    expect(`${reported.message}${reported.stack}`).not.toContain(PRIVATE_MARKER);
  });

  it('keeps production console output sanitized', () => {
    internals.isDevelopment = false;
    logger.warn(`[SharingService] Shared ${PRIVATE_MARKER} statement`);
    logger.error(`[Analytics] Failed for ${PRIVATE_MARKER}`, new Error(PRIVATE_MARKER));

    const consoleOutput = warn.mock.calls.flat().join('\n');
    expect(consoleOutput).toContain('[SharingService] Diagnostic event');
    expect(consoleOutput).not.toContain(PRIVATE_MARKER);
  });
});
