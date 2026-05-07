/**
 * Logger Utility
 *
 * Provides structured logging with different levels.
 * Supports direct performance metrics and trace-correlated logs.
 */

import * as Sentry from '@sentry/react-native';
import { AppConfig } from '@/src/constants/app-config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'metric';

type PerformanceReporter = (metric: string, value: number, context?: Record<string, any>) => void;

interface LogContext {
  traceId?: string;
  [key: string]: any;
}

class Logger {
  private isDevelopment = __DEV__;
  private performanceReporter?: PerformanceReporter;
  private logBuffer: string[] = [];
  private readonly MAX_BUFFER_SIZE = 100;

  /**
   * Set a reporter to handle performance-related metric events
   */
  setPerformanceReporter(reporter: PerformanceReporter) {
    this.performanceReporter = reporter;
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    // Skip debug logs in production
    if (level === 'debug' && !this.isDevelopment) {
      return;
    }

    // Trace logic: Console visibility for developers
    if (message.startsWith('[Trace]')) {
      if (!AppConfig.features.debug.tracePerformance) {
        return;
      }
    }

    const timestamp = new Date().toISOString();
    const contextStr = context?.traceId ? ` [TRC:${context.traceId}]` : '';
    let detailStr = '';
    if (context) {
      try {
        detailStr = ` | ${JSON.stringify(context)}`;
      } catch (error) {
        detailStr = ` | [Serialization Error: ${error instanceof Error ? error.message : String(error)}]`;
      }
    }

    // Don't clutter console with raw metrics in prod unless Trace feature is on
    if (level === 'metric' && !AppConfig.features.debug.tracePerformance && !this.isDevelopment) {
      return;
    }

    const logMessage = `[${timestamp}] [${level.toUpperCase()}]${contextStr} ${message}${detailStr}`;

    // Update in-memory buffer
    this.logBuffer.push(logMessage);
    if (this.logBuffer.length > this.MAX_BUFFER_SIZE) {
      this.logBuffer.shift();
    }

    switch (level) {
      case 'debug':
        console.log(logMessage);
        break;
      case 'info':
      case 'metric':
        console.info(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'error':
        console.error(logMessage);
        break;
    }
  }

  /**
   * Report a structured performance metric.
   * Bypasses regex parsing and goes directly to the analytics reporter.
   */
  metric(name: string, duration: number, context?: LogContext) {
    const threshold = AppConfig.performance.slowTraceThresholdMs;

    // 1. Report to consolidated analytics if it's "Slow"
    if (this.performanceReporter && duration >= threshold) {
      this.performanceReporter(name, duration, context);
    }

    // 2. Log to console for visibility (if enabled)
    this.log('metric', `${name}: ${duration}ms`, context);
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    const errorContext = {
      ...context,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
            }
          : error,
    };
    this.log('error', message, errorContext);

    // Report to Sentry
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: context });
    } else if (typeof error === 'string') {
      Sentry.captureMessage(error, { extra: context });
    } else if (error) {
      Sentry.captureException(new Error(String(error)), { extra: context });
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
