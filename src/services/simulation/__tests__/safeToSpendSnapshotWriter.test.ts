import {
  persistSafeToSpendSnapshot,
  restoreSafeToSpendPaintSnapshot,
  toSafeToSpendPaintSnapshot,
  type SafeToSpendPaintSnapshot,
} from '../safeToSpendSnapshotWriter';
import { snapshotService } from '@/src/utils/SnapshotService';
import { FlowType } from '@/src/services/simulation/types';
import type { SafeToSpendDashboard } from '@/src/services/simulation/safeToSpendDashboardProjection';
import { AccountSubtype } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

const mockSnapshotStore = new Map<string, unknown>();

jest.mock('@/src/utils/storage', () => ({
  storage: {
    set: jest.fn((key: string, value: unknown) => mockSnapshotStore.set(key, value)),
    getString: jest.fn((key: string) => mockSnapshotStore.get(key) as string | undefined),
    remove: jest.fn((key: string) => mockSnapshotStore.delete(key)),
    getAllKeys: jest.fn(() => Array.from(mockSnapshotStore.keys())),
  },
}));

function sampleDashboard(): SafeToSpendDashboard {
  return {
    summary: {
      safeToSpend: 4321,
      shortfall: 0,
      trajectoryMinBalance: 4000,
      safeDaysCount: 12,
      totalFutureInflow: 100,
      totalPlannedInflow: 100,
      totalCommittedPlanned: 50,
      totalPlannedOutflow: 50,
      firstMajorInflowDay: 3,
    },
    report: {
      allFlows: [{ kind: 'OUTFLOW', amount: 1 } as never],
      liabilities: {
        total: 10,
        totalCreditCard: 4,
        totalOther: 6,
        committed: 8,
        committedCreditCard: 3,
        committedOther: 5,
      },
      budget: { currentMonthRemaining: 20, nextMonthProjected: 30, nextMonthDays: 10 },
      summary: {
        firstMajorInflowDay: 3,
        totalFutureInflow: 100,
        totalPlannedInflow: 100,
        totalPlannedOutflow: 50,
        totalCommittedPlanned: 50,
      },
    },
    accountSummaries: [],
    totalLiquidAssets: 9000,
    currencyCode: 'INR',
    liquidAssetSubtypes: [AccountSubtype.CASH],
    dailyBudgetBurn: 2,
    projection: {
      history: [
        {
          timestamp: 1,
          value: 9,
          isProjected: false,
          details: [{ name: 'x', amount: 1, type: FlowType.OUTFLOW }],
        },
      ],
      projection: [
        {
          timestamp: 2,
          value: 8,
          isProjected: true,
          dailyBurn: 2,
          details: [{ name: 'y', amount: 1, type: FlowType.OUTFLOW }],
        },
      ],
      safeDaysCount: 12,
      safeToSpend: 4321,
    },
    accountMap: new Map([['a1', { id: 'a1', name: 'Cash' } as never]]),
    safeToSpendDays: 30,
  };
}

describe('safeToSpendSnapshotWriter', () => {
  beforeEach(() => {
    mockSnapshotStore.clear();
    snapshotService.clearSnapshots();
  });

  it('round-trips the mint number without heavy sim payloads', () => {
    const paint = toSafeToSpendPaintSnapshot(sampleDashboard());
    expect(paint.summary.safeToSpend).toBe(4321);
    expect(paint.currencyCode).toBe('INR');
    expect(paint.snapshotKind).toBe('paint');
    expect('allFlows' in paint.report).toBe(false);
    expect('accountMap' in paint).toBe(false);
    expect(paint.projection.projection[0]?.details).toBeUndefined();

    persistSafeToSpendSnapshot('wp-1' as WorkplaceId, sampleDashboard());
    const restored = snapshotService.getCustomSnapshot<SafeToSpendPaintSnapshot>(
      'wp-1',
      'safe_to_spend',
    );
    expect(restored?.summary.safeToSpend).toBe(4321);
    expect(restored?.currencyCode).toBe('INR');
    expect(restored?.snapshotKind).toBe('paint');
    expect(restored && 'allFlows' in restored.report).toBe(false);
    expect(restored && 'accountMap' in restored).toBe(false);
  });

  it('marks legacy cached dashboards as paint-only without rebuilding them', () => {
    const legacy = sampleDashboard();
    const restored = restoreSafeToSpendPaintSnapshot(legacy);

    expect(restored.snapshotKind).toBe('paint');
    expect(restored.summary).toBe(legacy.summary);
    expect(restored.projection).toBe(legacy.projection);
  });
});
