/**
 * Audit Service
 * 
 * Tracks all create/update/delete operations for compliance and audit trail.
 */

import { database } from '@/src/data/database/Database'
import AuditLog, { AuditAction } from '@/src/data/models/AuditLog'
import { Q } from '@nozbe/watermelondb'

export interface AuditEntry {
    entityType: string
    entityId: string
    action: AuditAction
    changes: any // Will be JSON stringified
}

export class AuditService {
    private get auditLogs() {
        return database.collections.get<AuditLog>('audit_logs')
    }

    /**
     * Log an audit entry
     *  
     * Should be called after any create/update/delete operation
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
     * Get audit trail for a specific entity
     */
    async getAuditTrail(
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
     * Get recent audit logs (for audit viewer)
     */
    async getRecentLogs(limit: number = 100): Promise<AuditLog[]> {
        return this.auditLogs
            .query(
                Q.sortBy('timestamp', Q.desc),
                Q.take(limit)
            )
            .fetch()
    }
}

// Export singleton instance
export const auditService = new AuditService()
