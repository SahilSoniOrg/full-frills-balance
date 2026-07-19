import { database } from '@/src/data/database/Database';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import FinancialPet from '@/src/data/models/FinancialPet';
import { InboxProcessingStatus } from '@/src/data/models/TransactionInboxRecord';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import { Observable, combineLatest, from, map, switchMap } from 'rxjs';

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum PetMood {
  Asleep = 'asleep',
  Hungry = 'hungry',
  Happy = 'happy',
  Ecstatic = 'ecstatic',
}

export enum PetEvolution {
  Egg = 'egg',
  Baby = 'baby',
  Companion = 'companion',
  Sage = 'sage',
}

export enum PetAction {
  ReviewSms = 'review_sms',
  LogTransaction = 'log_transaction',
  StreakMilestone = 'streak_milestone',
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface HealthResult {
  health: number; // 0-100
  mood: PetMood;
  budgetHealthWeight: number;
  auditDisciplineWeight: number;
}

export interface PetState {
  health: number;
  mood: PetMood;
  level: number;
  xp: number;
  evolution: PetEvolution;
  xpToNextLevel: number;
}

// ─── XP Constants ────────────────────────────────────────────────────────────

const XP_REVIEW_SMS = 10;
const XP_LOG_TRANSACTION = 25;
const XP_STREAK_MILESTONE = 50;
const XP_PER_LEVEL = 100;

// ─── Service ─────────────────────────────────────────────────────────────────

export class FinancialPetService {
  /**
   * Compute the health score for a workplace based on budget margins
   * and inbox discipline.
   *
   * Health = (budgetHealthWeight × 0.6) + (auditDisciplineWeight × 0.4)
   */
  async computeHealth(workplaceId: WorkplaceId): Promise<HealthResult> {
    try {
      const [budgetHealthWeight, auditDisciplineWeight] = await Promise.all([
        this.computeBudgetHealthWeight(workplaceId),
        this.computeAuditDisciplineWeight(workplaceId),
      ]);

      const health = budgetHealthWeight * 0.6 + auditDisciplineWeight * 0.4;
      const clamped = Math.round(Math.max(0, Math.min(100, health)));

      return {
        health: clamped,
        mood: this.mapMood(clamped),
        budgetHealthWeight: Math.round(budgetHealthWeight * 100) / 100,
        auditDisciplineWeight: Math.round(auditDisciplineWeight * 100) / 100,
      };
    } catch (error) {
      logger.error('[FinancialPetService] Failed to compute health', {
        workplaceId,
        error,
      });
      // Return a neutral health on error so the UI doesn't crash
      return {
        health: 50,
        mood: PetMood.Happy,
        budgetHealthWeight: 50,
        auditDisciplineWeight: 50,
      };
    }
  }

  /**
   * Award XP for a completed action and handle level-up.
   * The entire read-modify-write is performed inside the write batch
   * to prevent race conditions when two concurrent calls happen.
   */
  async awardXp(
    workplaceId: WorkplaceId,
    action: PetAction,
  ): Promise<PetState> {
    try {
      let xpGain: number;
      switch (action) {
        case PetAction.ReviewSms:
          xpGain = XP_REVIEW_SMS;
          break;
        case PetAction.LogTransaction:
          xpGain = XP_LOG_TRANSACTION;
          break;
        case PetAction.StreakMilestone:
          xpGain = XP_STREAK_MILESTONE;
          break;
        default:
          xpGain = 0;
      }

      const result = await database.write(async writer => {
        const petsTable = writer.get<FinancialPet>('financial_pets');

        // Read pet inside write batch — safe from race conditions
        const existing = await petsTable
          .query(Q.where('workplace_id', workplaceId))
          .fetch();

        let pet: FinancialPet;
        if (existing.length > 0) {
          pet = existing[0];
        } else {
          // Create a new pet record
          pet = await petsTable.create(record => {
            record.workplaceId = workplaceId;
            record.xp = 0;
            record.level = 0;
          });
          logger.info('[FinancialPetService] Created new pet', { workplaceId });
        }

        const today = dayjs().format('YYYY-MM-DD');

        // Daily cap: only 1 log_transaction award per day
        if (action === PetAction.LogTransaction) {
          if (pet.lastActionDate === today) {
            // Already awarded today — return current state without modifying
            return { awarded: false, pet };
          }
        }

        // Read-modify-write inside the same batch transaction
        const currentXp = pet.xp ?? 0;
        const newXp = currentXp + xpGain;
        const newLevel = this.computeLevel(newXp);

        await pet.update(record => {
          record.xp = newXp;
          record.level = newLevel;
          if (action === PetAction.LogTransaction) {
            record.lastActionDate = today;
          }
          if (
            action === PetAction.ReviewSms ||
            action === PetAction.StreakMilestone
          ) {
            record.lastFedAt = Date.now();
          }
        });

        return { awarded: true, pet, newXp, newLevel };
      });

      if (!result.awarded) {
        // Daily cap hit — return current state
        const healthResult = await this.computeHealth(workplaceId);
        return {
          health: healthResult.health,
          mood: healthResult.mood,
          level: result.pet.level ?? 0,
          xp: result.pet.xp ?? 0,
          evolution: this.getEvolutionStage(result.pet.level ?? 0),
          xpToNextLevel: this.xpToNextLevel(result.pet.xp ?? 0),
        };
      }

      const healthResult = await this.computeHealth(workplaceId);

      logger.info('[FinancialPetService] XP awarded', {
        workplaceId,
        action,
        xpGain,
        newXp: result.newXp,
        newLevel: result.newLevel,
      });

      return {
        health: healthResult.health,
        mood: healthResult.mood,
        level: result.newLevel!,
        xp: result.newXp!,
        evolution: this.getEvolutionStage(result.newLevel!),
        xpToNextLevel: this.xpToNextLevel(result.newXp!),
      };
    } catch (error) {
      logger.error('[FinancialPetService] Failed to award XP', {
        workplaceId,
        action,
        error,
      });
      throw error;
    }
  }

  /**
   * Reactive observable that emits PetState whenever the underlying
   * financial_pets record or any health driver (budgets, inbox) changes.
   */
  observePetState(workplaceId: WorkplaceId): Observable<PetState> {
    const pet$ = from(this.getOrCreatePet(workplaceId)).pipe(
      switchMap(pet => {
        const table = database.collections.get<FinancialPet>('financial_pets');
        return table
          .query(Q.where('id', pet.id))
          .observeWithColumns(['xp', 'level', 'last_fed_at', 'last_action_date']);
      }),
      map(records => records[0]),
    );

    const health$ = from(this.computeHealth(workplaceId)).pipe(
      switchMap(() => {
        // Observe budget and inbox changes to recompute health reactively
        const budgets$ = this.observeActiveBudgets(workplaceId);
        const inbox$ = this.observePendingInboxCount(workplaceId);
        return combineLatest([budgets$, inbox$]).pipe(
          switchMap(async () => this.computeHealth(workplaceId)),
        );
      }),
    );

    return combineLatest([pet$, health$]).pipe(
      map(([pet, healthResult]) => ({
        health: healthResult.health,
        mood: healthResult.mood,
        level: pet?.level ?? 0,
        xp: pet?.xp ?? 0,
        evolution: this.getEvolutionStage(pet?.level ?? 0),
        xpToNextLevel: this.xpToNextLevel(pet?.xp ?? 0),
      })),
    );
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * budgetHealthWeight based on the number of active budgets:
   * - 0 budgets = 30 (no budgeting — risky)
   * - 1-2 budgets = 70 (some budgeting)
   * - 3+ budgets = 100 (well-budgeted)
   */
  private async computeBudgetHealthWeight(
    workplaceId: WorkplaceId,
  ): Promise<number> {
    try {
      const activeBudgets = await budgetRepository.fetchActive(workplaceId);

      const count = activeBudgets.length;

      if (count === 0) {
        return 30;
      }
      if (count <= 2) {
        return 70;
      }
      return 100;
    } catch (error) {
      logger.error(
        '[FinancialPetService] Failed to compute budget health weight',
        { workplaceId, error },
      );
      return 50;
    }
  }

  /**
   * auditDisciplineWeight = clamp(1 - (pendingInboxCount / 10), 0, 1) × 100
   */
  private async computeAuditDisciplineWeight(
    workplaceId: WorkplaceId,
  ): Promise<number> {
    try {
      const pendingCount = await this.countPendingInbox(workplaceId);
      const clamped = Math.max(0, Math.min(1, 1 - pendingCount / 10));
      return clamped * 100;
    } catch (error) {
      logger.error(
        '[FinancialPetService] Failed to compute audit discipline',
        { workplaceId, error },
      );
      return 50;
    }
  }

  /**
   * Count pending (unprocessed) inbox records for the workplace.
   */
  private async countPendingInbox(workplaceId: WorkplaceId): Promise<number> {
    try {
      const table = database.collections.get('transaction_inbox_records');
      const count = await table
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('processing_status', InboxProcessingStatus.PENDING),
        )
        .fetchCount();
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Observable that emits the count of pending inbox records whenever it changes.
   */
  private observePendingInboxCount(
    workplaceId: WorkplaceId,
  ) {
    const table = database.collections.get('transaction_inbox_records');
    return table
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('processing_status', InboxProcessingStatus.PENDING),
      )
      .observeCount();
  }

  /**
   * Observable that emits whenever active budgets change.
   */
  private observeActiveBudgets(workplaceId: WorkplaceId) {
    return budgetRepository.observeAllActive(workplaceId);
  }

  /**
   * Map a health score (0-100) to a PetMood.
   */
  private mapMood(health: number): PetMood {
    if (health >= 80) return PetMood.Ecstatic;
    if (health >= 50) return PetMood.Happy;
    if (health >= 20) return PetMood.Hungry;
    return PetMood.Asleep;
  }

  /**
   * Compute level from XP: level = floor(sqrt(xp / 100))
   * 100 XP per level.
   */
  private computeLevel(xp: number): number {
    return Math.floor(Math.sqrt(xp / XP_PER_LEVEL));
  }

  /**
   * Get the evolution stage for a given level.
   */
  getEvolutionStage(level: number): PetEvolution {
    if (level >= 15) return PetEvolution.Sage;
    if (level >= 10) return PetEvolution.Companion;
    if (level >= 5) return PetEvolution.Baby;
    return PetEvolution.Egg;
  }

  /**
   * XP needed to reach the next level.
   */
  private xpToNextLevel(currentXp: number): number {
    const currentLevel = this.computeLevel(currentXp);
    const nextLevelXp =
      (currentLevel + 1) * (currentLevel + 1) * XP_PER_LEVEL;
    return nextLevelXp - currentXp;
  }

  /**
   * Build a PetState from a FinancialPet record + health.
   */
  private async getPetState(pet: FinancialPet): Promise<PetState> {
    const healthResult = await this.computeHealth(pet.workplaceId);
    return {
      health: healthResult.health,
      mood: healthResult.mood,
      level: pet.level ?? 0,
      xp: pet.xp ?? 0,
      evolution: this.getEvolutionStage(pet.level ?? 0),
      xpToNextLevel: this.xpToNextLevel(pet.xp ?? 0),
    };
  }

  /**
   * Get or create a FinancialPet record for the workplace.
   */
  private async getOrCreatePet(
    workplaceId: WorkplaceId,
  ): Promise<FinancialPet> {
    const table = database.collections.get<FinancialPet>('financial_pets');
    const existing = await table
      .query(Q.where('workplace_id', workplaceId))
      .fetch();

    if (existing.length > 0) {
      return existing[0];
    }

    // Create a new pet record
    const newPet = await database.write(async writer => {
      const pet = await writer
        .get<FinancialPet>('financial_pets')
        .create(record => {
          record.workplaceId = workplaceId;
          record.xp = 0;
          record.level = 0;
        });
      return pet;
    });

    logger.info('[FinancialPetService] Created new pet', { workplaceId });
    return newPet;
  }
}

// Singleton export
export const financialPetService = new FinancialPetService();
