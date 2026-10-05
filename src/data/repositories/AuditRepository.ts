import { AppConfig } from '@/src/constants/app-config';
import { database } from '@/src/data/database/Database';
import AuditLog from '@/src/data/models/AuditLog';
import { AuditAction, AuditEntityType } from '@/src/types/enums';
import {
  AuditActor,
  AuditEventSource,
  AuditEventType,
  createAuditEventPayload,
} from '@/src/types/auditEvents';
import { resolveAuditActor } from '@/src/utils/resolveAuditActor';
import { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';

export interface AuditEntry<T = unknown> {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  changes: T;
  displayName?: string;
  eventType?: AuditEventType;
  source?: AuditEventSource;
  actor?: AuditActor;
  correlationId?: string;
  revertsLogId?: string;
  undoable?: boolean;
}

export interface AuditLogCursor {
  timestamp: number;
  id: string;
}

const MAX_AUDIT_PAGE_SIZE = 500;

function normalizeAuditPageSize(limit: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.min(MAX_AUDIT_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

export class AuditRepository {
  private get auditLogs() {
    return database.collections.get<AuditLog>('audit_logs');
  }

  async find(id: string, workplaceId: WorkplaceId): Promise<AuditLog | null> {
    const records = await this.auditLogs
      .query(Q.where('id', id), Q.where('workplace_id', workplaceId))
      .fetch();
    return records[0] ?? null;
  }

  prepareLog<T>(entry: AuditEntry<T>, workplaceId: WorkplaceId): AuditLog {
    return this.auditLogs.prepareCreate((record: AuditLog) => {
      this.applyEntryToRecord(record, entry);
      record.workplaceId = workplaceId;
    });
  }

  private applyEntryToRecord<T>(record: AuditLog, entry: AuditEntry<T>): void {
    record.entityType = entry.entityType.toLowerCase() as AuditEntityType;
    record.entityId = entry.entityId;
    record.action = entry.action;
    let payload: ReturnType<typeof createAuditEventPayload>;
    try {
      payload = createAuditEventPayload({
        entityType: entry.entityType,
        action: entry.action,
        changes: entry.changes,
        displayName: entry.displayName,
        eventType: entry.eventType,
        source: entry.source,
        actor: entry.actor ?? resolveAuditActor(entry.source),
        correlationId: entry.correlationId,
        revertsLogId: entry.revertsLogId,
        undoable: entry.undoable,
      });
    } catch (error) {
      logger.warn('[AuditRepository] Failed to stringify changes (possibly circular)', {
        entityType: entry.entityType,
        entityId: entry.entityId,
      });
      payload = createAuditEventPayload({
        entityType: entry.entityType,
        action: entry.action,
        eventType: entry.eventType,
        source: entry.source,
        actor: entry.actor ?? resolveAuditActor(entry.source),
        undoable: false,
        changes: {
          serializationError: error instanceof Error ? error.message : String(error),
        },
      });
    }
    record.changes = JSON.stringify(payload);
    record.source = payload.source;
    record.eventType = payload.eventType;
    record.correlationId = payload.correlationId ?? null;
    record.timestamp = Date.now();
    record.createdAt = new Date();
  }

  async findByEntity(
    entityType: AuditEntityType,
    entityId: string,
    workplaceId: WorkplaceId,
    limit: number = MAX_AUDIT_PAGE_SIZE,
  ): Promise<AuditLog[]> {
    return this.auditLogs
      .query(
        Q.where('entity_type', entityType.toLowerCase()),
        Q.where('entity_id', entityId),
        Q.where('workplace_id', workplaceId),
        Q.sortBy('timestamp', Q.desc),
        Q.sortBy('id', Q.desc),
        Q.take(normalizeAuditPageSize(limit)),
      )
      .fetch();
  }

  observeByEntity(
    entityType: AuditEntityType,
    entityId: string,
    workplaceId: WorkplaceId,
    limit: number = AppConfig.pagination.auditScreenLimit,
  ) {
    return this.auditLogs
      .query(
        Q.where('entity_type', entityType.toLowerCase()),
        Q.where('entity_id', entityId),
        Q.where('workplace_id', workplaceId),
        Q.sortBy('timestamp', Q.desc),
        Q.sortBy('id', Q.desc),
        Q.take(normalizeAuditPageSize(limit)),
      )
      .observe();
  }

  /**
   * Observe recent audit logs
   */
  observeRecent(
    limit: number = AppConfig.pagination.auditRecentLimit,
    workplaceId: WorkplaceId,
    entityType?: AuditEntityType,
    source?: AuditEventSource,
    eventType?: AuditEventType,
    correlationId?: string,
  ) {
    const clauses: Q.Clause[] = [Q.where('workplace_id', workplaceId)];
    if (entityType) clauses.push(Q.where('entity_type', entityType.toLowerCase()));
    if (source) clauses.push(Q.where('source', source));
    if (eventType) clauses.push(Q.where('event_type', eventType));
    if (correlationId) clauses.push(Q.where('correlation_id', correlationId));
    return this.auditLogs
      .query(
        ...clauses,
        Q.sortBy('timestamp', Q.desc),
        Q.sortBy('id', Q.desc),
        Q.take(normalizeAuditPageSize(limit)),
      )
      .observe();
  }

  async fetchOlder(
    cursor: AuditLogCursor,
    limit: number,
    workplaceId: WorkplaceId,
    entity?: {
      entityType?: AuditEntityType;
      entityId?: string;
      source?: AuditEventSource;
      eventType?: AuditEventType;
      correlationId?: string;
    },
  ): Promise<AuditLog[]> {
    const clauses: Q.Clause[] = [
      Q.where('workplace_id', workplaceId),
      Q.or(
        Q.where('timestamp', Q.lt(cursor.timestamp)),
        Q.and(Q.where('timestamp', Q.eq(cursor.timestamp)), Q.where('id', Q.lt(cursor.id))),
      ),
    ];
    if (entity?.entityType) {
      clauses.push(Q.where('entity_type', entity.entityType.toLowerCase()));
    }
    if (entity?.entityId) {
      if (!entity.entityType) throw new Error('Entity ID filter requires an entity type');
      clauses.push(Q.where('entity_id', entity.entityId));
    }
    if (entity?.source) clauses.push(Q.where('source', entity.source));
    if (entity?.eventType) clauses.push(Q.where('event_type', entity.eventType));
    if (entity?.correlationId) clauses.push(Q.where('correlation_id', entity.correlationId));

    return this.auditLogs
      .query(
        ...clauses,
        Q.sortBy('timestamp', Q.desc),
        Q.sortBy('id', Q.desc),
        Q.take(normalizeAuditPageSize(limit)),
      )
      .fetch();
  }

  /** Fetch a bounded audit page for maintenance, using a stable keyset cursor. */
  async findAll(
    workplaceId: WorkplaceId,
    page: { cursor?: AuditLogCursor; until?: AuditLogCursor; limit: number },
  ): Promise<AuditLog[]> {
    const clauses: Q.Clause[] = [Q.where('workplace_id', workplaceId)];
    if (page.until) {
      clauses.push(
        Q.or(
          Q.where('timestamp', Q.lt(page.until.timestamp)),
          Q.and(
            Q.where('timestamp', Q.eq(page.until.timestamp)),
            Q.where('id', Q.lte(page.until.id)),
          ),
        ),
      );
    }
    if (page.cursor) {
      clauses.push(
        Q.or(
          Q.where('timestamp', Q.lt(page.cursor.timestamp)),
          Q.and(
            Q.where('timestamp', Q.eq(page.cursor.timestamp)),
            Q.where('id', Q.lt(page.cursor.id)),
          ),
        ),
      );
    }
    const query = this.auditLogs.query(
      ...clauses,
      Q.sortBy('timestamp', Q.desc),
      Q.sortBy('id', Q.desc),
      Q.take(normalizeAuditPageSize(page.limit)),
    );
    return query.fetch();
  }

  async countByWorkplace(workplaceId: WorkplaceId): Promise<number> {
    return this.auditLogs.query(Q.where('workplace_id', workplaceId)).fetchCount();
  }
}

export const auditRepository = new AuditRepository();
