import { logger } from './logger';

/**
 * Trace - Encapsulates a single execution context for performance monitoring and correlation.
 * Use this to avoid global state cross-contamination in concurrent operations.
 */
export class Trace {
  public readonly traceId: string;
  public readonly actionName: string;
  private readonly startTime: number;
  private metadata: Record<string, unknown> = {};

  constructor(actionName: string, traceId?: string) {
    this.actionName = actionName;
    this.startTime = Date.now();
    this.traceId = traceId || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Add context metadata to the trace
   */
  setMetadata(key: string, value: unknown): this {
    this.metadata[key] = value;
    return this;
  }

  /**
   * Log a sub-segment or child metric within this trace.
   * Internal duration is calculated since trace start.
   */
  metric(name: string, context?: Record<string, unknown>) {
    const duration = Date.now() - this.startTime;
    logger.metric(`${this.actionName}.${name}`, duration, {
      ...this.metadata,
      ...context,
      traceId: this.traceId,
    });
  }

  /**
   * Complete the trace and log the total duration.
   */
  end(context?: Record<string, unknown>) {
    const duration = Date.now() - this.startTime;
    logger.metric(this.actionName, duration, {
      ...this.metadata,
      ...context,
      traceId: this.traceId,
      isTotal: true,
    });

    // Human-readable log for console/debugging
    logger.info(`[Trace] ${this.actionName} completed: ${duration}ms`, {
      ...this.metadata,
      ...context,
      traceId: this.traceId,
    });
  }

  /**
   * Log an info message correlated with this trace.
   */
  info(message: string, context?: Record<string, unknown>) {
    logger.info(message, {
      ...this.metadata,
      ...context,
      traceId: this.traceId,
    });
  }
}

class TraceService {
  /**
   * Start a new independent trace.
   */
  startTrace(actionName: string): Trace {
    return new Trace(actionName);
  }
}

export const traceService = new TraceService();
