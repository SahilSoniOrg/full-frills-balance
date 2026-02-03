import { database } from '@/src/data/database/Database'
import AuditLog, { AuditAction } from '@/src/data/models/AuditLog'
import { Q } from '@nozbe/watermelondb'

export interface AuditEntry {
    entityType: string
    entityId: string
    action: AuditAction
    changes: any // Will be JSON stringified
}

export class AuditRepository {
    private get auditLogs() {
        return database.collections.get<AuditLog>('audit_logs')
    }

    /**
     * Log an audit entry
     */
    async log(entry: AuditEntry): Promise<void> {
        await database.write(async () => {
            await this.auditLogs.create((record) => {
                record.entityType = entry.entityType
                record.entityId = entry.entityId
                record.action = entry.action
                record.changes = JSON.stringify(entry.changes)
                record.timestamp = Date.now()
            })
        })
    }

    /**
     * Find audit logs for a specific entity
     */
    async findByEntity(
        entityType: string,
        entityId: string
    ): Promise<AuditLog[]> {
        return this.auditLogs
            .query(
                Q.where('entity_type', entityType),
                Q.where('entity_id', entityId),
                Q.sortBy('timestamp', Q.desc)
            )
            .fetch()
    }

    /**
     * Observe audit logs for a specific entity
     */
    observeByEntity(
        entityType: string,
        entityId: string
    ) {
        return this.auditLogs
            .query(
                Q.where('entity_type', entityType),
                Q.where('entity_id', entityId),
                Q.sortBy('timestamp', Q.desc)
            )
            .observe()
    }

    /**
     * Observe recent audit logs
     */
    observeRecent(limit: number = 100) {
        return this.auditLogs
            .query(
                Q.sortBy('timestamp', Q.desc),
                Q.take(limit)
            )
            .observe()
    }

    /**
     * Fetch recent audit logs
     */
    async fetchRecent(limit: number = 100): Promise<AuditLog[]> {
        return this.auditLogs
            .query(
                Q.sortBy('timestamp', Q.desc),
                Q.take(limit)
            )
            .fetch()
    }

    /**
     * Fetch all audit logs
     */
    async findAll(): Promise<AuditLog[]> {
        return this.auditLogs
            .query(Q.sortBy('timestamp', Q.desc))
            .fetch()
    }

    /**
     * Count all audit logs
     */
    async countAll(): Promise<number> {
        return this.auditLogs
            .query()
            .fetchCount()
    }
}

export const auditRepository = new AuditRepository()
