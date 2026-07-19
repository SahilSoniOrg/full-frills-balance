import { InboxProcessingStatus } from '@/src/data/models/TransactionInboxRecord';
import {
  FinancialPetService,
  PetAction,
  PetEvolution,
  PetMood,
} from '@/src/services/FinancialPetService';
import { WorkplaceId } from '@/src/types/domain';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockWorkplaceId = 'wp-test-001' as WorkplaceId;

// Mock the database module
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
  const mockDayjs = jest.fn(() => mockDayjs);
  mockDayjs.format = jest.fn(() => '2026-07-19');
  return mockDayjs;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockPet(overrides: Record<string, any> = {}) {
  return {
    id: 'pet-1',
    workplaceId: mockWorkplaceId,
    xp: overrides.xp ?? 0,
    level: overrides.level ?? 0,
    lastFedAt: overrides.lastFedAt ?? undefined,
    lastActionDate: overrides.lastActionDate ?? undefined,
    createdAt: new Date('2026-07-01'),
    updatedAt: new Date('2026-07-19'),
    ...overrides,
  };
}

function createMockQueryResult(items: any[]) {
  return {
    fetch: jest.fn().mockResolvedValue(items),
    fetchCount: jest.fn().mockResolvedValue(items.length),
    observe: jest.fn(() => ({
      pipe: jest.fn(() => ({
        subscribe: jest.fn(),
      })),
    })),
    observeWithColumns: jest.fn(() => ({
      pipe: jest.fn(() => ({
        subscribe: jest.fn(),
      })),
    })),
    observeCount: jest.fn(() => ({
      pipe: jest.fn(() => ({
        subscribe: jest.fn(),
      })),
      subscribe: jest.fn(),
    })),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FinancialPetService', () => {
  let service: FinancialPetService;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinancialPetService();
    mockDb = require('@/src/data/database/Database').database;
  });

  describe('computeHealth', () => {
    it('should return 50/neutral health when no budgets exist and inbox is clean', async () => {
      // Mock budgets table returns empty
      const budgetsQuery = createMockQueryResult([]);
      // Mock inbox table returns 0 pending
      const inboxQuery = createMockQueryResult([]);

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'budgets') return { query: () => budgetsQuery };
        if (table === 'transaction_inbox_records') {
          return { query: () => inboxQuery };
        }
        return { query: () => createMockQueryResult([]) };
      });

      const result = await service.computeHealth(mockWorkplaceId);

      expect(result.health).toBeGreaterThanOrEqual(0);
      expect(result.health).toBeLessThanOrEqual(100);
      expect(typeof result.mood).toBe('string');
      expect(typeof result.budgetHealthWeight).toBe('number');
      expect(typeof result.auditDisciplineWeight).toBe('number');
    });

    it('should return health near 82 when 1 budget exists and inbox is empty', async () => {
      const budgetItem = { id: 'budget-1', _raw: { amount: 3000 }, amount: 3000, active: true };
      const budgetsQuery = createMockQueryResult([budgetItem]);
      const inboxQuery = createMockQueryResult([]);

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'budgets') return { query: () => budgetsQuery };
        if (table === 'transaction_inbox_records') {
          return { query: () => inboxQuery };
        }
        return { query: () => createMockQueryResult([]) };
      });

      const result = await service.computeHealth(mockWorkplaceId);

      // With 1 active budget:
      // budgetHealthWeight = 70 (1-2 budgets = 70)
      // auditDisciplineWeight = clamp(1 - 0/10, 0, 1) * 100 = 100
      // health = 70*0.6 + 100*0.4 = 42 + 40 = 82
      expect(result.health).toBe(82);
      expect(result.mood).toBe(PetMood.Ecstatic);
    });

    it('should return low health when inbox has many pending items', async () => {
      const budgetItem = { id: 'budget-1', _raw: { amount: 3000 }, amount: 3000, active: true };
      const budgetsQuery = createMockQueryResult([budgetItem]);
      // 10+ pending items
      const inboxQuery = createMockQueryResult(
        Array(10).fill({ id: 'inbox-1', processingStatus: InboxProcessingStatus.PENDING }),
      );

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'budgets') return { query: () => budgetsQuery };
        if (table === 'transaction_inbox_records') {
          return { query: () => inboxQuery };
        }
        return { query: () => createMockQueryResult([]) };
      });

      const result = await service.computeHealth(mockWorkplaceId);

      // budgetHealthWeight = 70 (1 budget)
      // auditDisciplineWeight = clamp(1 - 10/10, 0, 1) * 100 = 0
      // health = 70*0.6 + 0*0.4 = 42
      expect(result.health).toBe(42);
      expect(result.auditDisciplineWeight).toBe(0);
    });

    it('should return health of 18 when inbox has 10+ pending and budget is empty', async () => {
      const budgetsQuery = createMockQueryResult([]);
      const inboxQuery = createMockQueryResult(
        Array(10).fill({ id: 'inbox-1', processingStatus: InboxProcessingStatus.PENDING }),
      );

      mockDb.collections.get.mockImplementation((table: string) => {
        if (table === 'budgets') return { query: () => budgetsQuery };
        if (table === 'transaction_inbox_records') {
          return { query: () => inboxQuery };
        }
        return { query: () => createMockQueryResult([]) };
      });

      const result = await service.computeHealth(mockWorkplaceId);

      // budgetHealthWeight = 30 (0 budgets = 30)
      // auditDisciplineWeight = clamp(1 - 10/10, 0, 1) * 100 = 0
      // health = 30*0.6 + 0*0.4 = 18
      expect(result.health).toBe(18);
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
      // Access private method via prototype
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

      // Mock find + update inside write
      mockDb.write.mockImplementation(async (cb: any) => {
        const writer = {
          get: jest.fn(() => ({
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
          get: jest.fn(() => ({
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

      const result = await service.awardXp(
        mockWorkplaceId,
        PetAction.LogTransaction,
      );

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
          get: jest.fn(() => ({
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

      const result = await service.awardXp(
        mockWorkplaceId,
        PetAction.StreakMilestone,
      );

      expect(result.xp).toBe(50);
    });

    it('should level up when crossing XP threshold', async () => {
      // 100 XP = level 1 (floor(sqrt(100/100)) = floor(sqrt(1)) = 1)
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
          get: jest.fn(() => ({
            find: jest.fn().mockResolvedValue({
              ...pet,
              update: jest.fn(async (updater: any) => {
                await updater({
                  ...pet,
                  xp: 105,
                  level: 1,
                });
              }),
            }),
          })),
        };
        return cb(writer);
      });

      const result = await service.awardXp(
        mockWorkplaceId,
        PetAction.ReviewSms,
      );

      expect(result.xp).toBeGreaterThanOrEqual(100);
      expect(result.level).toBe(1);
    });

    it('should cap daily log_transaction to 1 per day', async () => {
      // Already logged today
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

      const result = await service.awardXp(
        mockWorkplaceId,
        PetAction.LogTransaction,
      );

      // Should not increase XP because already logged today
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

      // Mock the observeWithColumns to return a simple observable that emits
      petQuery.observeWithColumns = jest.fn(() => ({
        pipe: jest.fn(() => ({
          pipe: jest.fn(() => ({
            subscribe: jest.fn(({ next }: any) => {
              next([pet]);
              return { unsubscribe: jest.fn() };
            }),
          })),
        })),
      }));

      // Mock observeCount
      inboxQuery.observeCount = jest.fn(() => ({
        pipe: jest.fn(() => ({
          subscribe: jest.fn(),
        })),
      }));

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
});
