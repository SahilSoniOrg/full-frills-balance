import { InboxProcessingStatus } from '@/src/data/models/TransactionInboxRecord';
import {
  FinancialPetService,
  PetAction,
  PetEvolution,
  PetMood,
} from '@/src/services/FinancialPetService';
import { WorkplaceId } from '@/src/types/domain';
import { of } from 'rxjs';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockWorkplaceId = 'wp-test-001' as WorkplaceId;

// Mock database
jest.mock('@/src/data/database/Database', () => ({
  database: {
    collections: {
      get: jest.fn(),
    },
    write: jest.fn(cb => cb()),
  },
}));

// Mock logger
jest.mock('@/src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock dayjs
jest.mock('dayjs', () => {
  const fn: any = () => ({
    format: jest.fn(() => '2026-07-19'),
  });
  fn.format = jest.fn(() => '2026-07-19');
  return fn;
});

// Mock SnapshotService
jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: {
    saveFinancialPetSnapshot: jest.fn(),
    getFinancialPetSnapshot: jest.fn(),
  },
}));

// Mock budgetReadService
jest.mock('@/src/services/budget/budgetReadService', () => ({
  budgetReadService: {
    observeBudgetUsage: jest.fn(),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockPet(overrides: Record<string, any> = {}) {
  const pet: any = {
    id: 'pet-1',
    workplaceId: mockWorkplaceId,
    xp: overrides.xp ?? 0,
    level: overrides.level ?? 0,
    lastFedAt: overrides.lastFedAt ?? undefined,
    lastActionDate: overrides.lastActionDate ?? undefined,
    createdAt: new Date('2026-07-01'),
    updatedAt: new Date('2026-07-19'),
    update: jest.fn(async (cb: (r: any) => void) => {
      cb(pet);
    }),
    ...overrides,
  };
  return pet;
}

function createMockQueryResult(items: any[]) {
  return {
    fetch: jest.fn().mockResolvedValue(items),
    fetchCount: jest.fn().mockResolvedValue(items.length),
    observe: jest.fn(() => of(items)),
    observeWithColumns: jest.fn(() => of(items)),
    observeCount: jest.fn(() => of(items.length)),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FinancialPetService', () => {
  let service: FinancialPetService;
  let mockDb: any;
  let mockObserveBudgetUsage: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinancialPetService();
    mockDb = require('@/src/data/database/Database').database;
    mockDb.write.mockImplementation((cb: any) => cb(mockDb));
    mockObserveBudgetUsage = require('@/src/services/budget/budgetReadService').budgetReadService
      .observeBudgetUsage;
  });

  describe('computeHealth', () => {
    it('should return 100/ecstatic health when no active budgets exist and inbox is clean', async () => {
      const budgetsQuery = createMockQueryResult([]);
      const inboxQuery = createMockQueryResult([]);

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'budgets') return { query: () => budgetsQuery };
        if (table === 'transaction_inbox_records') {
          return { query: () => inboxQuery };
        }
        return { query: () => createMockQueryResult([]) };
      });

      const result = await service.computeHealth(mockWorkplaceId);

      expect(result.health).toBe(100);
      expect(result.mood).toBe(PetMood.Ecstatic);
      expect(result.budgetHealthWeight).toBe(100);
      expect(result.auditDisciplineWeight).toBe(100);
    });

    it('should calculate budget health weight using remaining margin percentage', async () => {
      const budgetItem = { id: 'budget-1', amount: 1000, active: true };
      const budgetsQuery = createMockQueryResult([budgetItem]);
      const inboxQuery = createMockQueryResult([]);

      // 600 remaining out of 1000 = 60% margin
      mockObserveBudgetUsage.mockReturnValue(
        of({ spent: 400, remaining: 600, budgetAmount: 1000, usagePercent: 0.4 }),
      );

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'budgets') return { query: () => budgetsQuery };
        if (table === 'transaction_inbox_records') {
          return { query: () => inboxQuery };
        }
        return { query: () => createMockQueryResult([]) };
      });

      const result = await service.computeHealth(mockWorkplaceId);

      // budgetHealthWeight = 60 (60% remaining margin)
      // auditDisciplineWeight = 100 (0 pending)
      // health = 60 * 0.6 + 100 * 0.4 = 36 + 40 = 76
      expect(result.budgetHealthWeight).toBe(60);
      expect(result.auditDisciplineWeight).toBe(100);
      expect(result.health).toBe(76);
      expect(result.mood).toBe(PetMood.Happy);
    });

    it('should return low health when inbox has many pending items', async () => {
      const budgetItem = { id: 'budget-1', amount: 1000, active: true };
      const budgetsQuery = createMockQueryResult([budgetItem]);
      const inboxQuery = createMockQueryResult(
        Array(10).fill({ id: 'inbox-1', processingStatus: InboxProcessingStatus.PENDING }),
      );

      // 100% remaining margin
      mockObserveBudgetUsage.mockReturnValue(
        of({ spent: 0, remaining: 1000, budgetAmount: 1000, usagePercent: 0 }),
      );

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'budgets') return { query: () => budgetsQuery };
        if (table === 'transaction_inbox_records') {
          return { query: () => inboxQuery };
        }
        return { query: () => createMockQueryResult([]) };
      });

      const result = await service.computeHealth(mockWorkplaceId);

      // budgetHealthWeight = 100
      // auditDisciplineWeight = clamp(1 - 10/10, 0, 1) * 100 = 0
      // health = 100*0.6 + 0*0.4 = 60
      expect(result.health).toBe(60);
      expect(result.auditDisciplineWeight).toBe(0);
    });

    it('should return health of 0 when budget is overspent and inbox has 10+ pending items', async () => {
      const budgetItem = { id: 'budget-1', amount: 1000, active: true };
      const budgetsQuery = createMockQueryResult([budgetItem]);
      const inboxQuery = createMockQueryResult(
        Array(10).fill({ id: 'inbox-1', processingStatus: InboxProcessingStatus.PENDING }),
      );

      // Overspent budget (-200 remaining = 0% margin)
      mockObserveBudgetUsage.mockReturnValue(
        of({ spent: 1200, remaining: -200, budgetAmount: 1000, usagePercent: 1.2 }),
      );

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'budgets') return { query: () => budgetsQuery };
        if (table === 'transaction_inbox_records') {
          return { query: () => inboxQuery };
        }
        return { query: () => createMockQueryResult([]) };
      });

      const result = await service.computeHealth(mockWorkplaceId);

      // budgetHealthWeight = 0 (clamped)
      // auditDisciplineWeight = 0
      // health = 0
      expect(result.health).toBe(0);
      expect(result.mood).toBe(PetMood.Asleep);
    });

    it('should handle errors gracefully and return neutral health', async () => {
      mockDb.collections.get.mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = await service.computeHealth(mockWorkplaceId);

      expect(result.health).toBe(50);
      expect(result.mood).toBe(PetMood.Happy);
    });
  });

  describe('mood mapping', () => {
    it('should map health 0-19 to Asleep', () => {
      const result = (service as any).mapMood(0);
      expect(result).toBe(PetMood.Asleep);
      expect((service as any).mapMood(19)).toBe(PetMood.Asleep);
    });

    it('should map health 20-49 to Hungry', () => {
      expect((service as any).mapMood(20)).toBe(PetMood.Hungry);
      expect((service as any).mapMood(49)).toBe(PetMood.Hungry);
    });

    it('should map health 50-79 to Happy', () => {
      expect((service as any).mapMood(50)).toBe(PetMood.Happy);
      expect((service as any).mapMood(79)).toBe(PetMood.Happy);
    });

    it('should map health 80-100 to Ecstatic', () => {
      expect((service as any).mapMood(80)).toBe(PetMood.Ecstatic);
      expect((service as any).mapMood(100)).toBe(PetMood.Ecstatic);
    });
  });

  describe('XP system', () => {
    it('should award 10 XP for reviewing an SMS', async () => {
      const pet = createMockPet({ xp: 0, level: 0 });
      const petQuery = createMockQueryResult([pet]);

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'financial_pets') return { query: () => petQuery };
        if (table === 'budgets') return { query: () => createMockQueryResult([]) };
        if (table === 'transaction_inbox_records') {
          return { query: () => createMockQueryResult([]) };
        }
        return { query: () => createMockQueryResult([]) };
      });

      mockDb.write.mockImplementation(async (cb: any) => {
        const writer = {
          collections: {
            get: jest.fn(() => ({
              query: () => petQuery,
            })),
          },
          get: jest.fn(() => ({
            query: () => petQuery,
            find: jest.fn().mockResolvedValue({
              ...pet,
              update: jest.fn(async (updater: any) => {
                await updater(pet);
              }),
            }),
          })),
        };
        return cb(writer);
      });

      const result = await service.awardXp(mockWorkplaceId, PetAction.ReviewSms);

      expect(result.xp).toBe(10);
      expect(result.evolution).toBe(PetEvolution.Egg);
    });

    it('should award 25 XP for logging a daily transaction', async () => {
      const pet = createMockPet({ xp: 0, level: 0 });
      const petQuery = createMockQueryResult([pet]);

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'financial_pets') return { query: () => petQuery };
        if (table === 'budgets') return { query: () => createMockQueryResult([]) };
        if (table === 'transaction_inbox_records') {
          return { query: () => createMockQueryResult([]) };
        }
        return { query: () => createMockQueryResult([]) };
      });

      mockDb.write.mockImplementation(async (cb: any) => {
        const writer = {
          collections: {
            get: jest.fn(() => ({
              query: () => petQuery,
            })),
          },
          get: jest.fn(() => ({
            query: () => petQuery,
          })),
        };
        return cb(writer);
      });

      const result = await service.awardXp(mockWorkplaceId, PetAction.LogTransaction);

      expect(result.xp).toBe(25);
    });

    it('should award 50 XP for a streak milestone', async () => {
      const pet = createMockPet({ xp: 0, level: 0 });
      const petQuery = createMockQueryResult([pet]);

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'financial_pets') return { query: () => petQuery };
        if (table === 'budgets') return { query: () => createMockQueryResult([]) };
        if (table === 'transaction_inbox_records') {
          return { query: () => createMockQueryResult([]) };
        }
        return { query: () => createMockQueryResult([]) };
      });

      mockDb.write.mockImplementation(async (cb: any) => {
        const writer = {
          collections: {
            get: jest.fn(() => ({
              query: () => petQuery,
            })),
          },
          get: jest.fn(() => ({
            query: () => petQuery,
          })),
        };
        return cb(writer);
      });

      const result = await service.awardXp(mockWorkplaceId, PetAction.StreakMilestone);

      expect(result.xp).toBe(50);
    });

    it('should level up when crossing XP threshold', async () => {
      const pet = createMockPet({ xp: 95, level: 0 });
      const petQuery = createMockQueryResult([pet]);

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'financial_pets') return { query: () => petQuery };
        if (table === 'budgets') return { query: () => createMockQueryResult([]) };
        if (table === 'transaction_inbox_records') {
          return { query: () => createMockQueryResult([]) };
        }
        return { query: () => createMockQueryResult([]) };
      });

      mockDb.write.mockImplementation(async (cb: any) => {
        const writer = {
          collections: {
            get: jest.fn(() => ({
              query: () => petQuery,
            })),
          },
          get: jest.fn(() => ({
            query: () => petQuery,
          })),
        };
        return cb(writer);
      });

      const result = await service.awardXp(mockWorkplaceId, PetAction.ReviewSms);

      expect(result.xp).toBeGreaterThanOrEqual(100);
      expect(result.level).toBe(1);
    });

    it('should cap daily log_transaction to 1 per day', async () => {
      const pet = createMockPet({
        xp: 25,
        level: 0,
        lastActionDate: '2026-07-19',
      });
      const petQuery = createMockQueryResult([pet]);

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'financial_pets') return { query: () => petQuery };
        if (table === 'budgets') return { query: () => createMockQueryResult([]) };
        if (table === 'transaction_inbox_records') {
          return { query: () => createMockQueryResult([]) };
        }
        return { query: () => createMockQueryResult([]) };
      });

      const result = await service.awardXp(mockWorkplaceId, PetAction.LogTransaction);

      expect(result.xp).toBe(25);
    });
  });

  describe('evolution stages', () => {
    it('should return Egg for levels 0-4', () => {
      expect(service.getEvolutionStage(0)).toBe(PetEvolution.Egg);
      expect(service.getEvolutionStage(4)).toBe(PetEvolution.Egg);
    });

    it('should return Baby for levels 5-9', () => {
      expect(service.getEvolutionStage(5)).toBe(PetEvolution.Baby);
      expect(service.getEvolutionStage(9)).toBe(PetEvolution.Baby);
    });

    it('should return Companion for levels 10-14', () => {
      expect(service.getEvolutionStage(10)).toBe(PetEvolution.Companion);
      expect(service.getEvolutionStage(14)).toBe(PetEvolution.Companion);
    });

    it('should return Sage for levels 15+', () => {
      expect(service.getEvolutionStage(15)).toBe(PetEvolution.Sage);
      expect(service.getEvolutionStage(20)).toBe(PetEvolution.Sage);
    });
  });

  describe('observePetState', () => {
    it('should return an observable and emit initial state', done => {
      const pet = createMockPet({ xp: 50, level: 0 });
      const petQuery = createMockQueryResult([pet]);
      const budgetsQuery = createMockQueryResult([]);
      const inboxQuery = createMockQueryResult([]);

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'financial_pets') return { query: () => petQuery };
        if (table === 'budgets') return { query: () => budgetsQuery };
        if (table === 'transaction_inbox_records') {
          return { query: () => inboxQuery };
        }
        return { query: () => createMockQueryResult([]) };
      });

      const observable = service.observePetState(mockWorkplaceId);

      expect(observable).toBeDefined();
      expect(typeof observable.subscribe).toBe('function');

      const subscription = observable.subscribe({
        next: (state: any) => {
          expect(state).toBeDefined();
          expect(typeof state.health).toBe('number');
          expect(typeof state.mood).toBe('string');
          expect(typeof state.level).toBe('number');
          expect(typeof state.xp).toBe('number');
          expect(typeof state.evolution).toBe('string');
          expect(typeof state.xpToNextLevel).toBe('number');
          expect(state.xp).toBe(50);
          subscription.unsubscribe();
          done();
        },
        error: done,
      });
    });
  });

  describe('calculatePetPayload', () => {
    it('should compute happy pet payload for 0 unreviewed items and positive margin', () => {
      const payload = FinancialPetService.calculatePetPayload(0, 100, 10);
      expect(payload.petHealth).toBe(100);
      expect(payload.petMood).toBe('ecstatic');
      expect(payload.unreviewedCount).toBe(0);
      expect(payload.safeToSpendRunwayDays).toBe(10);
    });

    it('should apply audit deficit penalty for unreviewed inbox count', () => {
      const payload = FinancialPetService.calculatePetPayload(3, 100, 5);
      expect(payload.petHealth).toBe(88);
      expect(payload.petMood).toBe('ecstatic');
    });

    it('should reduce base health on negative remaining margin', () => {
      const payload = FinancialPetService.calculatePetPayload(0, -5000, 0);
      expect(payload.petHealth).toBe(70);
      expect(payload.petMood).toBe('happy');
    });

    it('should assign asleep mood for low health score', () => {
      const payload = FinancialPetService.calculatePetPayload(10, -8000, 0);
      expect(payload.petHealth).toBe(12);
      expect(payload.petMood).toBe('asleep');
    });
  });
});
