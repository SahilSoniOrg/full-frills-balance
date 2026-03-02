import { AppConfig } from '@/src/constants'
import { database } from '@/src/data/database/Database'
import Journal, { JournalStatus } from '@/src/data/models/Journal'
import PlannedPayment, { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/data/models/PlannedPayment'
import Transaction, { TransactionType } from '@/src/data/models/Transaction'
import { journalRepository } from '@/src/data/repositories/JournalRepository'
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository'
import { transactionRepository } from '@/src/data/repositories/TransactionRepository'
import { ledgerWriteService } from '@/src/services/ledger'
import { rebuildQueueService } from '@/src/services/RebuildQueueService'
import { logger } from '@/src/utils/logger'
import { Q } from '@nozbe/watermelondb'

export class PlannedPaymentService {
    /**
     * Normalizes a timestamp to the start of the day (midnight).
     */
    private normalizeToStartOfDay(timestamp: number): number {
        const date = new Date(timestamp);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    }

    /**
     * Calculates the next occurrence based on interval and recurrence rules.
     * Normalizes to midnight to ensure consistency.
     */
    calculateNextOccurrence(
        current: number,
        pp: {
            intervalN: number;
            intervalType: PlannedPaymentInterval;
            recurrenceDay?: number;
            recurrenceMonth?: number;
        }
    ): number {
        const date = new Date(this.normalizeToStartOfDay(current));

        const { intervalN, intervalType, recurrenceDay, recurrenceMonth } = pp;

        switch (intervalType) {
            case PlannedPaymentInterval.DAILY:
                date.setDate(date.getDate() + intervalN);
                break;
            case PlannedPaymentInterval.WEEKLY:
                // Move to the next week cycle
                date.setDate(date.getDate() + (intervalN * 7));
                // If recurrenceDay is set (index 0-6), align to it
                if (recurrenceDay !== undefined && recurrenceDay !== null) {
                    const currentDay = date.getDay();
                    const diff = (recurrenceDay - currentDay + 7) % 7;
                    date.setDate(date.getDate() + diff);
                }
                break;
            case PlannedPaymentInterval.MONTHLY:
                {
                    const targetDay = recurrenceDay ?? date.getDate();
                    date.setDate(1);
                    date.setMonth(date.getMonth() + intervalN);

                    const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
                    date.setDate(Math.min(targetDay, lastDayOfTargetMonth));
                }
                break;
            case PlannedPaymentInterval.YEARLY:
                {
                    const targetMonth = recurrenceMonth !== undefined && recurrenceMonth !== null ? recurrenceMonth - 1 : date.getMonth();
                    const targetDay = recurrenceDay ?? date.getDate();

                    date.setFullYear(date.getFullYear() + intervalN);
                    date.setDate(1);
                    date.setMonth(targetMonth);

                    const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
                    date.setDate(Math.min(targetDay, lastDayOfTargetMonth));
                }
                break;
        }
        return date.getTime();
    }

    /**
     * Generates a PLANNED journal from a rule.
     */
    async generatePlannedJournal(pp: PlannedPayment, occurrenceDate: number): Promise<void> {
        try {
            if (!pp.toAccountId) {
                logger.warn(`Planned payment ${pp.id} is missing toAccountId — skipping journal generation.`)
                return
            }

            const transactions = [
                {
                    accountId: pp.fromAccountId,
                    amount: pp.amount,
                    transactionType: TransactionType.CREDIT,
                    notes: pp.description,
                    currencyCode: pp.currencyCode,
                },
                {
                    accountId: pp.toAccountId,
                    amount: pp.amount,
                    transactionType: TransactionType.DEBIT,
                    notes: pp.description,
                    currencyCode: pp.currencyCode,
                },
            ]

            const normalizedDate = this.normalizeToStartOfDay(occurrenceDate)

            await ledgerWriteService.createJournal({
                journalDate: normalizedDate,
                description: pp.name,
                currencyCode: pp.currencyCode,
                transactions,
                status: pp.isAutoPost ? JournalStatus.POSTED : JournalStatus.PLANNED,
                plannedPaymentId: pp.id,
            })

        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : (error != null ? String(error) : 'unknown error (null thrown)')
            logger.error(`Failed to generate planned journal for payment ${pp.id}: ${message}`, error instanceof Error ? error : undefined)
        }
    }

    async postOccurrence(pp: PlannedPayment, occurrenceDate: number): Promise<void> {
        try {
            const normalizedDate = this.normalizeToStartOfDay(occurrenceDate)
            const dayEnd = normalizedDate + (AppConfig.time.msPerDay - 1)

            // 1. Check if we already have a PLANNED journal for this occurrence
            const existingPlanned = await database.collections.get<Journal>('journals').query(
                Q.where('planned_payment_id', pp.id),
                Q.where('journal_date', Q.between(normalizedDate, dayEnd)),
                Q.where('status', JournalStatus.PLANNED),
                Q.where('deleted_at', Q.eq(null))
            ).fetch()

            if (existingPlanned.length > 0) {
                // Promote to POSTED by patching status only — no tx churn needed.
                const j = existingPlanned[0];
                await database.write(async () => {
                    await j.update((record: Journal) => {
                        record.status = JournalStatus.POSTED;
                        record.updatedAt = new Date();
                    });
                });
                // Rebuild balance for affected accounts.
                const txs = await transactionRepository.findByJournal(j.id);
                rebuildQueueService.enqueueMany(new Set(txs.map((t: Transaction) => t.accountId)), j.journalDate);
            } else {
                // Fallback: Create new POSTED journal if none existed
                if (!pp.toAccountId) {
                    throw new Error(`Planned payment ${pp.id} is missing toAccountId.`)
                }

                const transactions = [
                    {
                        accountId: pp.fromAccountId,
                        amount: pp.amount,
                        transactionType: TransactionType.CREDIT,
                        notes: pp.description,
                        currencyCode: pp.currencyCode,
                    },
                    {
                        accountId: pp.toAccountId,
                        amount: pp.amount,
                        transactionType: TransactionType.DEBIT,
                        notes: pp.description,
                        currencyCode: pp.currencyCode,
                    },
                ]

                await ledgerWriteService.createJournal({
                    journalDate: normalizedDate,
                    description: pp.name,
                    currencyCode: pp.currencyCode,
                    transactions,
                    status: JournalStatus.POSTED,
                    plannedPaymentId: pp.id,
                })
            }

            // 2. Advance the next occurrence
            const nextOcc = this.calculateNextOccurrence(normalizedDate, pp)

            // 3. Update the planned payment record
            if (pp.endDate && nextOcc > pp.endDate) {
                await plannedPaymentRepository.update(pp, {
                    nextOccurrence: nextOcc,
                    status: PlannedPaymentStatus.COMPLETED
                })
            } else {
                await plannedPaymentRepository.update(pp, {
                    nextOccurrence: nextOcc
                })
            }

            logger.info(`Manually posted occurrence for planned payment ${pp.id} at ${new Date(normalizedDate).toLocaleDateString()}`)

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.error(`Failed to post manual occurrence for payment ${pp.id}: ${message}`)
            throw error
        }
    }

    /**
     * Skips a specific occurrence of a planned payment.
     * Deletes any existing PLANNED journal for that occurrence and advances the schedule.
     */
    async skipOccurrence(pp: PlannedPayment, occurrenceDate: number): Promise<void> {
        try {
            const normalizedDate = this.normalizeToStartOfDay(occurrenceDate)
            const dayEnd = normalizedDate + (AppConfig.time.msPerDay - 1)

            // 1. Find and delete any existing PLANNED journal for this occurrence
            const existingPlanned = await database.collections.get<Journal>('journals').query(
                Q.where('planned_payment_id', pp.id),
                Q.where('journal_date', Q.between(normalizedDate, dayEnd)),
                Q.where('status', JournalStatus.PLANNED),
                Q.where('deleted_at', Q.eq(null))
            ).fetch()

            for (const journal of existingPlanned) {
                await journalRepository.deleteJournal(journal.id)
            }

            // 2. Advance the schedule
            const nextOcc = this.calculateNextOccurrence(normalizedDate, pp)

            // 3. Update the planned payment record
            if (pp.endDate && nextOcc > pp.endDate) {
                await plannedPaymentRepository.update(pp, {
                    nextOccurrence: nextOcc,
                    status: PlannedPaymentStatus.COMPLETED
                })
            } else {
                await plannedPaymentRepository.update(pp, {
                    nextOccurrence: nextOcc
                })
            }

            logger.info(`Skipped occurrence for planned payment ${pp.id} at ${new Date(normalizedDate).toLocaleDateString()}`)

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.error(`Failed to skip occurrence for payment ${pp.id}: ${message}`)
            throw error
        }
    }

    /**
     * Process all active planned payments and generate journals for any due occurrences.
     * Typically called on app start.
     */
    async processDuePayments(): Promise<void> {
        const activePayments = await plannedPaymentRepository.findAllActive()
        const nowTime = this.normalizeToStartOfDay(Date.now())
        const horizon = nowTime + (AppConfig.insights.recurringHorizonDays * AppConfig.time.msPerDay)

        // H-3 fix: pre-fetch all relevant journals in ONE query before the loop.
        // Without this, the while-loop issues a fetchCount() per occurrence —
        // O(N×occurrences) sequential DB round-trips at startup.
        const allPlannedIds = activePayments.map(p => p.id);
        const existingJournals = allPlannedIds.length > 0
            ? await database.collections.get<Journal>('journals').query(
                Q.where('planned_payment_id', Q.oneOf(allPlannedIds)),
                Q.where('deleted_at', Q.eq(null))
            ).fetch()
            : [];

        // Build a quick-lookup: paymentId → Set of day-start timestamps already journalled
        const journalledDays = new Map<string, Set<number>>();
        for (const j of existingJournals) {
            const dayStart = this.normalizeToStartOfDay(j.journalDate);
            if (!journalledDays.has(j.plannedPaymentId!)) {
                journalledDays.set(j.plannedPaymentId!, new Set());
            }
            journalledDays.get(j.plannedPaymentId!)!.add(dayStart);
        }

        for (const pp of activePayments) {
            let nextOcc = this.normalizeToStartOfDay(pp.nextOccurrence)

            if (nextOcc > horizon) continue

            let generationsCount = 0;
            const MAX_GENERATIONS = 365;

            while (nextOcc <= horizon && generationsCount < MAX_GENERATIONS) {
                generationsCount++;

                // In-memory duplicate check — no DB query per occurrence.
                const alreadyExists = journalledDays.get(pp.id)?.has(nextOcc) ?? false;

                if (!alreadyExists) {
                    // F-09 Fix: Add a secondary DB-level check right before generation
                    // to prevent duplicate generation if processDuePayments runs concurrently
                    const dayEnd = nextOcc + (AppConfig.time.msPerDay - 1);
                    const dbExists = await database.collections.get<Journal>('journals').query(
                        Q.where('planned_payment_id', pp.id),
                        Q.where('journal_date', Q.between(nextOcc, dayEnd)),
                        Q.where('deleted_at', Q.eq(null))
                    ).fetchCount();

                    if (dbExists === 0) {
                        await this.generatePlannedJournal(pp, nextOcc)
                        // Register the new day so back-to-back occurrences don't double-generate.
                        if (!journalledDays.has(pp.id)) journalledDays.set(pp.id, new Set());
                        journalledDays.get(pp.id)!.add(nextOcc);
                    } else {
                        logger.warn(`[PlannedPaymentService] Prevented duplicate journal generation for payment ${pp.id} via db-level check.`);
                    }
                }

                nextOcc = this.calculateNextOccurrence(nextOcc, pp)

                if (pp.endDate && nextOcc > pp.endDate) {
                    await plannedPaymentRepository.update(pp, { status: PlannedPaymentStatus.COMPLETED })
                    break
                }
            }

            if (generationsCount >= MAX_GENERATIONS) {
                logger.warn(`[PlannedPaymentService] Safety cap reached for payment ${pp.id}. Generated ${MAX_GENERATIONS} journals.`);
            }

            if (nextOcc !== pp.nextOccurrence) {
                await plannedPaymentRepository.update(pp, { nextOccurrence: nextOcc })
            }
        }
    }
}

export const plannedPaymentService = new PlannedPaymentService()
