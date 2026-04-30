import { AuditAction } from '@/src/data/models/AuditLog';
import { JournalStatus } from '@/src/data/models/Journal';
import { accountService } from '@/src/features/accounts/services/AccountService';
import { journalService } from '@/src/features/journal/services/JournalService';
import { revertRegistry } from '@/src/services/revert-registry';
import { AccountAuditState, JournalAuditState } from '@/src/types/domain';

/**
 * Register all audit revert handlers.
 * This file should be imported early in the app lifecycle (e.g., app/_layout.tsx)
 * to ensure handlers are available for AuditService.
 */

// Journal Handler
revertRegistry.register(
  'journal',
  async (entityId, changes: { before?: JournalAuditState; after?: JournalAuditState }, action) => {
    if (action === AuditAction.CREATE) {
      await journalService.deleteJournal(entityId);
    } else if (action === AuditAction.DELETE) {
      await journalService.recoverJournal(entityId);
    } else if (action === AuditAction.UPDATE) {
      if (changes.before) {
        if ('deletedAt' in changes.before) {
          await journalService.deleteJournal(entityId);
        } else if ('status' in changes.before && !changes.before.transactions) {
          if (changes.before.status === JournalStatus.PLANNED) {
            await journalService.revertToPlanned(entityId);
          } else if (changes.before.status === JournalStatus.POSTED) {
            await journalService.postJournal(entityId);
          }
        } else {
          const before = changes.before;
          // Map JournalAuditState to CreateJournalData
          // If these fields are missing, the revert will fail (which is appropriate for a data-driven revert)
          await journalService.updateJournal(entityId, {
            journalDate: before.journalDate!,
            description: before.description,
            currencyCode: before.currencyCode!,
            status: before.status as JournalStatus,
            transactions: before.transactions || [],
          });
        }
      }
    }
  },
);

// Account Handler
revertRegistry.register(
  'account',
  async (entityId, changes: { before?: AccountAuditState; after?: AccountAuditState }, action) => {
    if (action === AuditAction.CREATE) {
      await accountService.deleteAccount(entityId);
    } else if (action === AuditAction.DELETE) {
      await accountService.recoverAccount(entityId);
    } else if (action === AuditAction.UPDATE) {
      if (changes.before) {
        if ('deletedAt' in changes.before) {
          await accountService.deleteAccount(entityId);
        } else {
          // Partial<CreateAccountData> is already accepted by updateAccount
          await accountService.updateAccount(entityId, changes.before);
        }
      }
    }
  },
);
