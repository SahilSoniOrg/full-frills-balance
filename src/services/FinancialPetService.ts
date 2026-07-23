import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import FinancialPet from '@/src/data/models/FinancialPet';
import TransactionInboxRecord, {
  InboxProcessingStatus,
} from '@/src/data/models/TransactionInboxRecord';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { budgetReadService } from '@/src/services/budget/budgetReadService';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { snapshotService } from '@/src/utils/SnapshotService';
import { Q } from '@nozbe/watermelondb';
import dayjs from 'dayjs';
import {
  Observable,
  combineLatest,
  debounceTime,
  firstValueFrom,
  from,
  map,
  switchMap,
  take,
} from 'rxjs';

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

// ─── Constants ───────────────────────────────────────────────────────────────

const XP_REVIEW_SMS = 10;
const XP_LOG_TRANSACTION = 25;
const XP_STREAK_MILESTONE = 50;
const XP_PER_LEVEL = 100;

/**
 * Maximum threshold of pending inbox records before audit discipline score drops to 0.
 * A backlog of 10 or more pending records represents severe review deficit.
 */
const AUDIT_DEFICIT_PENDING_THRESHOLD = 10;

/**
 * Action to XP gain mapping table to eliminate repeated switch statements.
 */
const ACTION_XP_MAP: Record<PetAction, number> = {
  [PetAction.ReviewSms]: XP_REVIEW_SMS,
  [PetAction.LogTransaction]: XP_LOG_TRANSACTION,
  [PetAction.StreakMilestone]: XP_STREAK_MILESTONE,
};

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * FinancialPetService
 *
 * Core engine for Financial Pet health score, budget margin tracking, and inbox discipline audit.
 *
 * Note on gamification scope:
 * Per specification (widget_implementation_spec.md), core health is driven by remaining budget margin
 * and inbox audit discipline. The XP/level/evolution/mood system serves as a coherent gamification UI layer
 * built on top of this engine.
 *
 * Shared Data Seam:
 * Evaluated PetState payloads are serialized to persistent MMKV snapshot storage via SnapshotService
 * (key: financial_pet_snapshot) and shared with the AppGroup so native widgets can read pre-cooked pet state.
 */
export class FinancialPetService {
  /**
   * Calculate pet health and mood payload for widgets based on unreviewed inbox count
   * and remaining budget margin ratio or amount.
   */
  static calculatePetPayload(
    unreviewedCount: number,
    remainingMarginOrRatio = 1.0,
    safeToSpendRunwayDays = 0,
  ): {
    petHealth: number;
    petMood: PetMood;
    unreviewedCount: number;
    safeToSpendRunwayDays: number;
  } {
    let budgetHealthWeight = 100;
    if (remainingMarginOrRatio < 0) {
      budgetHealthWeight = Math.max(0, 100 - Math.min(80, Math.abs(remainingMarginOrRatio) / 100));
    } else if (remainingMarginOrRatio <= 1.0) {
      budgetHealthWeight = remainingMarginOrRatio * 100;
    } else {
      budgetHealthWeight = Math.min(100, remainingMarginOrRatio);
    }

    const auditDisciplineWeight = Math.max(
      0,
      Math.min(100, (1 - unreviewedCount / AUDIT_DEFICIT_PENDING_THRESHOLD) * 100),
    );
    const petHealth = Math.round(budgetHealthWeight * 0.6 + auditDisciplineWeight * 0.4);
    const petMood = FinancialPetService.mapMood(petHealth);

    return {
      petHealth,
      petMood,
      unreviewedCount,
      safeToSpendRunwayDays,
    };
  }

  /**
   * Map a health score (0-100) to a PetMood (static).
   */
  static mapMood(health: number): PetMood {
    if (health >= 80) return PetMood.Ecstatic;
    if (health >= 50) return PetMood.Happy;
    if (health >= 20) return PetMood.Hungry;
    return PetMood.Asleep;
  }

  /**
   * Instance delegate for mapMood (for backwards compatibility).
   */
  mapMood(health: number): PetMood {
    return FinancialPetService.mapMood(health);
  }

  /**
   * Compute the health score for a workplace based on remaining budget margins
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
        mood: FinancialPetService.mapMood(clamped),
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
   * Performs read-modify-write inside a write batch to prevent race conditions.
   */
  async awardXp(workplaceId: WorkplaceId, action: PetAction): Promise<PetState> {
    try {
      const xpGain = ACTION_XP_MAP[action] ?? 0;

      const result = await database.write(async writer => {
        const pet = await this.getOrCreatePet(workplaceId, writer);
        const today = dayjs().format('YYYY-MM-DD');

        // Daily cap: only 1 log_transaction award per day
        if (action === PetAction.LogTransaction) {
          if (pet.lastActionDate === today) {
            return { awarded: false, pet };
          }
        }

        const currentXp = pet.xp ?? 0;
        const newXp = currentXp + xpGain;
        const newLevel = this.computeLevel(newXp);

        await pet.update(record => {
          record.xp = newXp;
          record.level = newLevel;
          if (action === PetAction.LogTransaction) {
            record.lastActionDate = today;
          }
          if (action === PetAction.ReviewSms || action === PetAction.StreakMilestone) {
            record.lastFedAt = Date.now();
          }
        });

        return { awarded: true, pet, newXp, newLevel };
      });

      const healthResult = await this.computeHealth(workplaceId);
      const petState = this.buildPetState(
        {
          level: result.awarded ? result.newLevel : result.pet.level,
          xp: result.awarded ? result.newXp : result.pet.xp,
        },
        healthResult,
      );

      snapshotService.saveFinancialPetSnapshot(workplaceId, petState);

      if (result.awarded) {
        logger.info('[FinancialPetService] XP awarded', {
          workplaceId,
          action,
          xpGain,
          newXp: result.newXp,
          newLevel: result.newLevel,
        });
      }

      return petState;
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
        const budgets$ = this.observeActiveBudgets(workplaceId);
        const inbox$ = this.observePendingInboxCount(workplaceId);
        const journals$ = database.collections
          .get<Journal>('journals')
          .query(Q.where('workplace_id', workplaceId), Q.where('deleted_at', Q.eq(null)))
          .observe();
        return combineLatest([budgets$, inbox$, journals$]).pipe(
          debounceTime(150),
          switchMap(() => from(this.computeHealth(workplaceId))),
        );
      }),
    );

    return combineLatest([pet$, health$]).pipe(
      map(([pet, healthResult]) => {
        const petState = this.buildPetState({ level: pet?.level, xp: pet?.xp }, healthResult);
        snapshotService.saveFinancialPetSnapshot(workplaceId, petState);
        return petState;
      }),
    );
  }

  /**
   * Get evolution stage for a given level.
   */
  getEvolutionStage(level: number): PetEvolution {
    if (level >= 15) return PetEvolution.Sage;
    if (level >= 10) return PetEvolution.Companion;
    if (level >= 5) return PetEvolution.Baby;
    return PetEvolution.Egg;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * computeBudgetHealthWeight computes budget health weight using remaining margin across active budgets.
   * Evaluates active budgets via budgetReadService and derives remaining margin percentage.
   */
  private async computeBudgetHealthWeight(workplaceId: WorkplaceId): Promise<number> {
    try {
      const activeBudgets = await budgetRepository.fetchActive(workplaceId);
      if (activeBudgets.length === 0) {
        return 100;
      }

      let totalBudgetAmount = 0;
      let totalRemaining = 0;

      const usages = await Promise.all(
        activeBudgets.map(async budget => {
          try {
            return await firstValueFrom(
              budgetReadService.observeBudgetUsage(workplaceId, budget).pipe(take(1)),
            );
          } catch {
            return {
              spent: 0,
              remaining: budget.amount ?? 0,
              budgetAmount: budget.amount ?? 0,
              usagePercent: 0,
            };
          }
        }),
      );

      for (const usage of usages) {
        totalBudgetAmount += usage.budgetAmount;
        totalRemaining += usage.remaining;
      }

      if (totalBudgetAmount === 0) {
        return 100;
      }

      const marginRatio = totalRemaining / totalBudgetAmount;
      return Math.round(Math.max(0, Math.min(100, marginRatio * 100)));
    } catch (error) {
      logger.error('[FinancialPetService] Failed to compute budget health weight', {
        workplaceId,
        error,
      });
      return 50;
    }
  }

  /**
   * auditDisciplineWeight = clamp(1 - (pendingInboxCount / AUDIT_DEFICIT_PENDING_THRESHOLD), 0, 1) × 100
   */
  private async computeAuditDisciplineWeight(workplaceId: WorkplaceId): Promise<number> {
    try {
      const pendingCount = await this.countPendingInbox(workplaceId);
      const clamped = Math.max(0, Math.min(1, 1 - pendingCount / AUDIT_DEFICIT_PENDING_THRESHOLD));
      return clamped * 100;
    } catch (error) {
      logger.error('[FinancialPetService] Failed to compute audit discipline', {
        workplaceId,
        error,
      });
      return 50;
    }
  }

  /**
   * Count pending (unprocessed) inbox records for the workplace.
   */
  private async countPendingInbox(workplaceId: WorkplaceId): Promise<number> {
    const table = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
    const count = await table
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('processing_status', InboxProcessingStatus.PENDING),
        Q.where('parse_status', Q.oneOf(['parsed', 'parse_failed'])),
      )
      .fetchCount();
    return count;
  }

  /**
   * Observable emitting the count of pending inbox records on changes.
   */
  private observePendingInboxCount(workplaceId: WorkplaceId) {
    const table = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
    return table
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('processing_status', InboxProcessingStatus.PENDING),
        Q.where('parse_status', Q.oneOf(['parsed', 'parse_failed'])),
      )
      .observeCount();
  }

  /**
   * Observable emitting whenever active budgets change.
   */
  private observeActiveBudgets(workplaceId: WorkplaceId) {
    return budgetRepository.observeAllActive(workplaceId);
  }

  /**
   * Compute level from XP: level = floor(sqrt(xp / 100))
   */
  private computeLevel(xp: number): number {
    return Math.floor(Math.sqrt(xp / XP_PER_LEVEL));
  }

  /**
   * XP needed to reach the next level.
   */
  private xpToNextLevel(currentXp: number): number {
    const currentLevel = this.computeLevel(currentXp);
    const nextLevelXp = (currentLevel + 1) * (currentLevel + 1) * XP_PER_LEVEL;
    return nextLevelXp - currentXp;
  }

  /**
   * Factory function to build PetState from pet level/xp and health result.
   */
  private buildPetState(
    pet: { level?: number; xp?: number },
    healthResult: HealthResult,
  ): PetState {
    const level = pet.level ?? 0;
    const xp = pet.xp ?? 0;
    return {
      health: healthResult.health,
      mood: healthResult.mood,
      level,
      xp,
      evolution: this.getEvolutionStage(level),
      xpToNextLevel: this.xpToNextLevel(xp),
    };
  }

  /**
   * Build a PetState from a FinancialPet record + health.
   */
  async getPetState(pet: FinancialPet): Promise<PetState> {
    const healthResult = await this.computeHealth(pet.workplaceId);
    const petState = this.buildPetState(pet, healthResult);
    snapshotService.saveFinancialPetSnapshot(pet.workplaceId, petState);
    return petState;
  }

  /**
   * Get or create a FinancialPet record for the workplace.
   * Accepts an optional writer/database interface to participate in an existing WatermelonDB write batch.
   */
  private async getOrCreatePet(
    workplaceId: WorkplaceId,
    dbOrWriter?: unknown,
  ): Promise<FinancialPet> {
    const targetDb =
      dbOrWriter && typeof dbOrWriter === 'object' && 'collections' in dbOrWriter
        ? (dbOrWriter as typeof database)
        : database;
    const table = targetDb.collections.get<FinancialPet>('financial_pets');
    const existing = await table.query(Q.where('workplace_id', workplaceId)).fetch();

    if (existing.length > 0) {
      return existing[0];
    }

    const createPetRecord = async (w: typeof database) => {
      const recheck = await w.collections
        .get<FinancialPet>('financial_pets')
        .query(Q.where('workplace_id', workplaceId))
        .fetch();
      if (recheck.length > 0) {
        return recheck[0];
      }
      const pet = await w.collections
        .get<FinancialPet>('financial_pets')
        .create((record: FinancialPet) => {
          record.workplaceId = workplaceId;
          record.xp = 0;
          record.level = 0;
        });
      logger.info('[FinancialPetService] Created new pet', { workplaceId });
      return pet;
    };

    if (dbOrWriter) {
      return await createPetRecord(targetDb);
    } else {
      return await database.write(async w => createPetRecord(w as unknown as typeof database));
    }
  }
}

// Singleton export
export const financialPetService = new FinancialPetService();
