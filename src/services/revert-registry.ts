export type RevertHandler<T = any> = (
  entityId: string,
  changes: { before?: Partial<T>; after?: Partial<T> },
  action: string,
  workplaceId: string,
) => Promise<void>;

class RevertRegistry {
  private handlers = new Map<string, RevertHandler>();

  /**
   * Register a reversion handler for a specific entity type.
   * This allows features to provide reversion logic without AuditService
   * needing to import the feature services directly.
   */
  register(entityType: string, handler: RevertHandler) {
    this.handlers.set(entityType.toLowerCase(), handler);
  }

  /**
   * Get the handler for an entity type.
   */
  getHandler(entityType: string): RevertHandler | undefined {
    return this.handlers.get(entityType.toLowerCase());
  }
}

export const revertRegistry = new RevertRegistry();
