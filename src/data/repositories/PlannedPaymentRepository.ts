import { database } from '@/src/data/database/Database'
import PlannedPayment, { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/data/models/PlannedPayment'
import { Q } from '@nozbe/watermelondb'

export interface PlannedPaymentPersistenceInput {
    name: string
    description?: string
    amount: number
    currencyCode: string
    fromAccountId: string
    toAccountId: string
    intervalN: number
    intervalType: PlannedPaymentInterval
    startDate: number
    endDate?: number
    nextOccurrence: number
    status: PlannedPaymentStatus
    isAutoPost: boolean
    recurrenceDay?: number
    recurrenceMonth?: number
}

export class PlannedPaymentRepository {
    private get db() {
        return database
    }

    private get plannedPayments() {
        return this.db.collections.get<PlannedPayment>('planned_payments')
    }

    observeAll() {
        return this.plannedPayments
            .query(Q.where('deleted_at', Q.eq(null)), Q.sortBy('next_occurrence', Q.asc))
            .observe()
    }

    observeById(id: string) {
        return this.plannedPayments.findAndObserve(id);
    }

    observeActive() {
        return this.plannedPayments
            .query(
                Q.where('status', PlannedPaymentStatus.ACTIVE),
                Q.where('deleted_at', Q.eq(null)),
                Q.sortBy('next_occurrence', Q.asc)
            )
            .observe()
    }

    async findAllActive(): Promise<PlannedPayment[]> {
        return this.plannedPayments
            .query(
                Q.where('status', PlannedPaymentStatus.ACTIVE),
                Q.where('deleted_at', Q.eq(null))
            )
            .fetch()
    }

    async find(id: string): Promise<PlannedPayment | null> {
        try {
            return await this.plannedPayments.find(id)
        } catch {
            return null
        }
    }

    async create(data: PlannedPaymentPersistenceInput): Promise<PlannedPayment> {
        return await this.db.write(async () => {
            return this.plannedPayments.create((pp) => {
                Object.assign(pp, data)
                pp.createdAt = new Date()
                pp.updatedAt = new Date()
            })
        })
    }

    async update(pp: PlannedPayment, updates: Partial<PlannedPaymentPersistenceInput>): Promise<PlannedPayment> {
        return await this.db.write(async () => {
            await pp.update((record) => {
                Object.assign(record, updates)
                record.updatedAt = new Date()
            })
            return pp
        })
    }

    async delete(pp: PlannedPayment): Promise<void> {
        await this.db.write(async () => {
            await pp.update((record) => {
                record.deletedAt = new Date()
                record.updatedAt = new Date()
            })
        })
    }
}

export const plannedPaymentRepository = new PlannedPaymentRepository()
