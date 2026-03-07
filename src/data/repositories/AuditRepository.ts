import { AppConfig } from '@/src/constants/app-config'
import { database } from '@/src/data/database/Database'
import AuditLog, { AuditAction, AuditEntityType } from '@/src/data/models/AuditLog'
import { Q } from '@nozbe/watermelondb'

export interface AuditEntry<T = any> {
    entityType: AuditEntityType
    entityId: string
    action: AuditAction
    changes: T // Will be JSON stringified
}

export class AuditRepository {
    private get auditLogs() {
        return database.collections.get<AuditLog>('audit_logs')
    }

    /**
     * Log an audit entry
     */
    async log<T>(entry: AuditEntry<T>): Promise<void> {
        await database.write(async () => {
            await this.auditLogs.create((record: AuditLog) => {
                record.entityType = entry.entityType.toLowerCase() as AuditEntityType
                record.entityId = entry.entityId
                record.action = entry.action
                record.changes = JSON.stringify(entry.changes)
                record.timestamp = Date.now()
                record.createdAt = new Date()
            })
        })
    }

    /**
     * Find audit logs for a specific entity
     */
    async findByEntity(
        entityType: AuditEntityType,
        entityId: string
    ): Promise<AuditLog[]> {
        return this.auditLogs
            .query(
                Q.where('entity_type', entityType.toLowerCase()),
                Q.where('entity_id', entityId),
                Q.sortBy('timestamp', Q.desc)
            )
            .fetch()
    }

    /**
     * Observe audit logs for a specific entity
     */
    observeByEntity(
        entityType: AuditEntityType,
        entityId: string
    ) {
        return this.auditLogs
            .query(
                Q.where('entity_type', entityType.toLowerCase()),
                Q.where('entity_id', entityId),
                Q.sortBy('timestamp', Q.desc)
            )
            .observe()
    }

    /**
     * Observe recent audit logs
     */
    observeRecent(limit: number = AppConfig.pagination.auditRecentLimit) {
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
    async fetchRecent(limit: number = AppConfig.pagination.auditRecentLimit): Promise<AuditLog[]> {
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
