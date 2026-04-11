import { database } from '@/src/data/database/Database';
import { AppConfig } from '@/src/constants';
import AuditLog, { AuditAction, AuditEntityType } from '@/src/data/models/AuditLog';
import { AuditEntry, auditRepository } from '@/src/data/repositories/AuditRepository';
import { JournalStatus } from '@/src/data/models/Journal';
import { accountService } from '@/src/features/accounts/services/AccountService';
import { journalService } from '@/src/features/journal/services/JournalService';

/**
 * Audit Service
 *
 * Thin wrapper around AuditRepository for logging and retrieving audit entries.
 */
export class AuditService {
  /**
   * Log an audit entry
   */
  async log<T>(entry: AuditEntry<T>): Promise<void> {
    return auditRepository.log(entry);
  }

  /**
   * Revert an audit entry
   */
  async revertEntry(logId: string): Promise<{ success: boolean; error?: string }> {
    const log = await auditRepository.find(logId);
    if (!log) return { success: false, error: AppConfig.strings.audit.errors.notFound(logId) };
    if (!log.canRevert)
      return { success: false, error: AppConfig.strings.audit.errors.revertFailed };

    const changes = log.parsedChanges;
    const entityId = log.entityId;

    try {
      switch (log.entityType) {
        case 'account': {
          if (log.action === AuditAction.CREATE) {
            // Reverting CREATE -> Delete
            await accountService.deleteAccount(entityId);
          } else if (log.action === AuditAction.DELETE) {
            // Reverting DELETE -> Recover
            await accountService.recoverAccount(entityId);
          } else if (log.action === AuditAction.UPDATE) {
            // Reverting UPDATE -> Restore 'before' state
            if (changes.before) {
              if ('deletedAt' in changes.before) {
                // Reverting an undelete
                await accountService.deleteAccount(entityId);
              } else {
                await accountService.updateAccount(entityId, changes.before);
              }
            }
          }
          break;
        }
        case 'journal': {
          if (log.action === AuditAction.CREATE) {
            await journalService.deleteJournal(entityId);
          } else if (log.action === AuditAction.DELETE) {
            // Reverting DELETE for journal now supported via recoverJournal
            await journalService.recoverJournal(entityId);
          } else if (log.action === AuditAction.UPDATE) {
            if (changes.before) {
              if ('deletedAt' in changes.before) {
                // Reverting an undelete
                await journalService.deleteJournal(entityId);
              } else if ('status' in changes.before && !changes.before.transactions) {
                // Reverting a status change
                if (changes.before.status === JournalStatus.PLANNED) {
                  await journalService.revertToPlanned(entityId);
                } else if (changes.before.status === JournalStatus.POSTED) {
                  await journalService.postJournal(entityId);
                }
              } else {
                await journalService.updateJournal(entityId, changes.before);
              }
            }
          }
          break;
        }
        default:
          return {
            success: false,
            error: AppConfig.strings.audit.errors.revertTypeNotSupported(log.entityType),
          };
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || AppConfig.strings.audit.errors.revertFailed,
      };
    }
  }

  /**
   * Get audit trail for a specific entity
   */
  async getAuditTrail(entityType: AuditEntityType, entityId: string): Promise<AuditLog[]> {
    return auditRepository.findByEntity(entityType, entityId);
  }

  /**
   * Get recent audit logs (for audit viewer)
   */
  async getRecentLogs(limit: number = AppConfig.pagination.auditRecentLimit): Promise<AuditLog[]> {
    return auditRepository.fetchRecent(limit);
  }

  /**
   * Observe audit trail for a specific entity
   */
  observeAuditTrail(entityType: AuditEntityType, entityId: string) {
    return auditRepository.observeByEntity(entityType, entityId);
  }

  /**
   * Observe recent audit logs
   */
  observeRecentLogs(limit: number = AppConfig.pagination.auditRecentLimit) {
    return auditRepository.observeRecent(limit);
  }

  /**
   * Cleanup legacy entity types (convert to lowercase)
   * This is an idempotent one-time migration.
   */
  async cleanupLegacyEntityTypes(): Promise<number> {
    const allLogs = await auditRepository.findAll();
    const uppercaseLogs = allLogs.filter(log => log.entityType !== log.entityType.toLowerCase());

    if (uppercaseLogs.length === 0) return 0;

    await database.write(async () => {
      const batches = [];
      const batchSize = AppConfig.pagination.auditRecentLimit;
      for (let i = 0; i < uppercaseLogs.length; i += batchSize) {
        batches.push(uppercaseLogs.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        await database.batch(
          ...batch.map(log =>
            log.prepareUpdate(record => {
              record.entityType = log.entityType.toLowerCase() as AuditEntityType;
            }),
          ),
        );
      }
    });

    return uppercaseLogs.length;
  }
}

// Export singleton instance
export const auditService = new AuditService();
