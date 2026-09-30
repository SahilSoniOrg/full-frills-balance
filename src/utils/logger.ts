/**
 * Logger Utility
 *
 * Provides structured logging with different levels.
 * Supports direct performance metrics and trace-correlated logs.
 */

import * as Sentry from '@sentry/react-native';
import { AppConfig } from '@/src/constants/app-config';
import {
  safeDiagnosticError,
  sanitizeLogContext,
  sanitizeLogMessage,
} from '@/src/utils/observabilityPrivacy';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'metric';

type PerformanceReporter = (
  metric: string,
  value: number,
  context?: Record<string, unknown>,
) => void;

interface LogContext {
  traceId?: string;
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = __DEV__;
  private performanceReporter?: PerformanceReporter;
  private logBuffer: string[] = [];
  private readonly MAX_BUFFER_SIZE = 1000;

  /**
   * Set a reporter to handle performance-related metric events
   */
  setPerformanceReporter(reporter: PerformanceReporter) {
    this.performanceReporter = reporter;
  }

  private formatLine(
    timestamp: string,
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): string {
    const contextStr =
      context?.traceId && typeof context.traceId === 'string' ? ` [TRC:${context.traceId}]` : '';
    let detailStr = '';
    if (context && Object.keys(context).length) {
      try {
        detailStr = ` | ${JSON.stringify(context, (_key, value: unknown) =>
          value instanceof Error ? (value.stack ?? `${value.name}: ${value.message}`) : value,
        )}`;
      } catch {
        detailStr = ' | [Diagnostic context unavailable]';
      }
    }
    return `[${timestamp}] [${level.toUpperCase()}]${contextStr} ${message}${detailStr}`;
  }

  /**
   * The buffer feeds bug-report exports and is always sanitized. Only the development
   * console receives the original message, context and error.
   */
  private log(
    level: LogLevel,
    message: string | unknown,
    context?: LogContext,
    rawError?: unknown,
  ) {
    // Skip debug logs in production
    if (level === 'debug' && !this.isDevelopment) {
      return;
    }

    // Trace logic: Console visibility for developers
    const safeMessage = sanitizeLogMessage(message);
    const safeContext = sanitizeLogContext(context);
    if (safeMessage.startsWith('[Trace]')) {
      if (!AppConfig.features.debug.tracePerformance) {
        return;
      }
    }

    // Don't clutter console with raw metrics in prod unless Trace feature is on
    if (level === 'metric' && !AppConfig.features.debug.tracePerformance && !this.isDevelopment) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logMessage = this.formatLine(timestamp, level, safeMessage, safeContext);

    // Update in-memory buffer
    this.logBuffer.push(logMessage);
    if (this.logBuffer.length > this.MAX_BUFFER_SIZE) {
      this.logBuffer.shift();
    }

    let consoleMessage = logMessage;
    if (this.isDevelopment) {
      const rawMessage =
        message instanceof Error ? `${message.name}: ${message.message}` : String(message);
      const rawContext =
        rawError === undefined || rawError === null ? context : { ...context, error: rawError };
      consoleMessage = this.formatLine(timestamp, level, rawMessage, rawContext);
    }

    // Safety: Ensure we never pass anything but a string to console methods
    const outputMessage = String(
      consoleMessage || `[${timestamp}] [${level.toUpperCase()}] (Empty)`,
    );

    try {
      switch (level) {
        case 'debug':
          console.log(`[FFB] ${outputMessage}`);
          break;
        case 'info':
        case 'metric':
          console.info(`[FFB] ${outputMessage}`);
          break;
        case 'warn':
          console.warn(`[FFB] ${outputMessage}`);
          break;
        case 'error':
          // Use warn instead of error because some dev environments (Expo/Hermes)
          // crash or show "ERROR null" when console.error is called with complex payloads.
          console.warn(`[FFB-ERROR] ${outputMessage}`);
          break;
      }
    } catch {
      // If even console methods fail, we are in deep trouble, but don't crash
    }
  }

  /**
   * Report a structured performance metric.
   * Bypasses regex parsing and goes directly to the analytics reporter.
   */
  metric(name: string, duration: number, context?: LogContext) {
    try {
      const threshold = AppConfig.performance.slowTraceThresholdMs;

      // 1. Report to consolidated analytics if it's "Slow"
      if (this.performanceReporter && duration >= threshold) {
        this.performanceReporter(name, duration, context);
      }
    } catch {
      // Ignore reporter errors
    }

    // 2. Log to console for visibility (if enabled)
    this.log('metric', `${name}: ${duration}ms`, context);
  }

  debug(message: string | unknown, context?: LogContext) {
    this.log('debug', message, context);
  }

  info(message: string | unknown, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string | unknown, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string | unknown, error?: Error | unknown, context?: LogContext) {
    try {
      const safeMessage = sanitizeLogMessage(message);
      const safeError =
        error === undefined || error === null ? undefined : safeDiagnosticError(error);
      this.log(
        'error',
        message,
        {
          ...context,
          ...(safeError ? { error: safeError } : {}),
        },
        error,
      );

      // Report to Sentry (defensively)
      try {
        if (safeError) Sentry.captureException(safeError);
        else Sentry.captureMessage(safeMessage);
      } catch {
        // Ignore Sentry errors to prevent infinite loops or crashes
      }
    } catch {
      // Absolute fallback if logger itself fails
      console.log('Logger.error critically failed');
    }
  }

  /**
   * Get recently recorded logs for diagnostic reporting.
   */
  getRecentLogs(): string {
    return this.logBuffer.join('\n');
  }
}

// Export singleton instance
export const logger = new Logger();
