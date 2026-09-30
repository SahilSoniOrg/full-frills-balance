import { renderHook } from '@testing-library/react-native';
import { useDashboardViewModel } from '../useDashboardViewModel';
import { SafeToSpendCard } from '@/src/features/dashboard/components/SafeToSpendCard';
import { mapSafeToSpendViewModel } from '@/src/features/dashboard/mappers/SafeToSpendMapper';
import { AppConfig } from '@/src/constants';
import { formatDate } from '@/src/utils/dateUtils';
import { render, screen } from '@/src/utils/test-utils';
import type { SafeToSpendDashboard } from '@/src/services/simulation/safeToSpendDashboardProjection';

let mockWorkplace = { workplaceId: 'wp-a', defaultCurrencyCode: 'USD' };
let mockObserved: SafeToSpendDashboard | null = null;
let mockCached: unknown;
jest.mock('@/src/contexts/WorkplaceContext', () => ({ useWorkplace: () => mockWorkplace }));
jest.mock('@/src/contexts/app-shell/appReady', () => ({
  ...jest.requireActual('@/src/contexts/app-shell/appReady'),
  useAppReady: () => ({ isInitialized: true, isAppReady: true }),
}));
jest.mock('@/src/contexts/app-shell/AppOnboardingProvider', () => ({
  ...jest.requireActual('@/src/contexts/app-shell/AppOnboardingProvider'),
  useOnboardingSession: () => ({ hasCompletedOnboarding: true }),
}));
jest.mock('@/src/hooks/useDashboardPreferences', () => ({
  useDashboardPreferences: () => ({ showSafeToSpendChart: true }),
}));
jest.mock('@/src/features/dashboard/hooks/useRecentJournalEntries', () => ({
  useRecentJournalEntries: () => ({ items: [] }),
}));
jest.mock('@/src/features/planned-payments', () => ({
  usePlannedOccurrences: () => ({ items: [] }),
}));
jest.mock('@/src/features/dashboard/hooks/useDashboardFeatureActions', () => ({
  useDashboardFeatureActions: () => ({
    trackExplanationVisible: jest.fn(),
    trackExplanationSection: jest.fn(),
  }),
}));
jest.mock('@/src/hooks/useObservable', () => ({
  useObservable: (_factory: unknown, _deps: unknown, initial: unknown) => ({
    data: mockObserved ?? (typeof initial === 'function' ? (initial as () => unknown)() : initial),
  }),
}));
jest.mock('@/src/services/simulation/SafeToSpendReadModel', () => ({
  safeToSpendReadModel: { forWorkplace: () => ({ watch: () => ({}) }) },
}));
jest.mock('@/src/utils/SnapshotService', () => ({
  snapshotService: { getCustomSnapshotWithMetadata: () => mockCached },
}));
jest.mock('@/src/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), metric: jest.fn() },
}));

describe('dashboard forecast ownership and snapshot provenance', () => {
  afterEach(() => {
    mockWorkplace = { workplaceId: 'wp-a', defaultCurrencyCode: 'USD' };
    mockObserved = null;
    mockCached = undefined;
    jest.useRealTimers();
  });

  it('marks old-currency data stale and hides another workplace immediately', () => {
    mockObserved = {
      workplaceId: 'wp-a' as SafeToSpendDashboard['workplaceId'],
      currencyCode: 'USD',
      quality: 'ready',
      report: { allFlows: [] },
      accountMap: new Map(),
    } as unknown as SafeToSpendDashboard;
    const { result, rerender } = renderHook(() => useDashboardViewModel());
    mockWorkplace = { workplaceId: 'wp-a', defaultCurrencyCode: 'EUR' };
    rerender({});
    expect(result.current.safeToSpendData?.quality).toBe('stale');
    expect(result.current.safeToSpendDetailsReady).toBe(false);
    mockWorkplace = { workplaceId: 'wp-b', defaultCurrencyCode: 'EUR' };
    rerender({});
    expect(result.current.safeToSpendData).toBeNull();
  });

  it('restores a cached paint as stale, keeps its age, and renders the saved-age label', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const savedAt = 1_800_000_000_000 - 7_200_000;
    const dashboard = {
      workplaceId: 'wp-a',
      currencyCode: 'USD',
      quality: 'ready',
      asOf: savedAt - 1000,
      horizonDays: 30,
      safeToSpendDays: 30,
      summary: { safeToSpend: 200, shortfall: 0, trajectoryMinBalance: 200 },
      generatedAt: undefined,
      totalLiquidAssets: 1000,
      accountSummaries: [],
      liquidAssetSubtypes: [],
      report: { allFlows: [], liabilities: {}, budget: {}, summary: {} },
      accountMap: new Map(),
      projection: { history: [], projection: [], safeDaysCount: null, safeToSpend: 200 },
      explanation: {
        cashCeiling: 1000,
        minimumDatedBalance: 200,
        bindingDayOffset: 5,
        heldAmount: 800,
        shortfall: 0,
        horizonDays: 30,
        constrainingOutflows: [],
        assumedInflows: [],
      },
    } as unknown as SafeToSpendDashboard;
    mockCached = { data: dashboard, timestamp: savedAt, workplaceId: 'wp-a' };
    const { result } = renderHook(() => useDashboardViewModel());
    expect(result.current.safeToSpendData?.quality).toBe('stale');
    expect(result.current.safeToSpendData?.snapshotAgeMs).toBe(7_200_000);
    expect(result.current.safeToSpendDetailsReady).toBe(false);

    const stale = result.current.safeToSpendData!;
    const report = 'snapshotKind' in stale ? { ...stale.report, allFlows: [] } : stale.report;
    const accountMap = 'accountMap' in stale ? stale.accountMap : new Map();
    const vm = mapSafeToSpendViewModel(
      {
        summary: stale.summary,
        report,
        totalLiquidAssets: stale.totalLiquidAssets,
        accountSummaries: stale.accountSummaries,
        liquidAssetSubtypes: stale.liquidAssetSubtypes,
        accountMap,
        safeToSpendDays: stale.safeToSpendDays,
        explanation: stale.explanation,
        asOf: stale.asOf,
        snapshotAgeMs: stale.snapshotAgeMs,
      },
      { isLoading: false, currencyCode: stale.currencyCode },
    );
    render(
      <SafeToSpendCard
        projection={stale.projection}
        viewModel={vm}
        quality="stale"
        detailsReady={false}
        onInfoPress={() => undefined}
        onLegendPress={() => undefined}
      />,
    );
    const provenance = AppConfig.strings.dashboard.safeToSpendProvenance;
    expect(screen.getByText(provenance.savedAgo(2, 0))).toBeTruthy();
    expect(screen.getByText(provenance.basedOn(formatDate(savedAt - 1000), 30))).toBeTruthy();
  });
});
