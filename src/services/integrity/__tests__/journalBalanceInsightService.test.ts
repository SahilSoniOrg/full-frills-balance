import type { JournalId, WorkplaceId } from '@/src/types/ids';
import { journalBalanceInsightService } from '../journalBalanceInsightService';

const mockStorage = new Map<string, string>();
const mockCleared = jest.fn();
const mockFind = jest.fn();
const mockFindByIds = jest.fn();
let currentUnbalancedJournalIds: string[] = [];

// Mock state lives outside the factories so it survives jest.resetModules (a simulated relaunch).
jest.mock('../journalBalanceAudit', () => ({
  findUnbalancedJournals: (...args: unknown[]) => mockFind(...args),
  findUnbalancedJournalsByIds: (...args: unknown[]) => mockFindByIds(...args),
}));
jest.mock('@/src/utils/storage', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => mockStorage.set(key, value),
    remove: (key: string) => mockStorage.delete(key),
  },
}));
jest.mock('@/src/services/analytics', () => ({
  analytics: { track: (...args: unknown[]) => mockCleared(...args) },
}));

const workplaceId = 'wp-insight' as WorkplaceId;

function auditResult(journalIds: string[]) {
  return {
    journalsChecked: 10,
    unbalanced: journalIds.map(journalId => ({
      journal: { journalId: journalId as JournalId },
      evaluation: {},
    })),
  };
}

function auditReturns(journalIds: string[]) {
  currentUnbalancedJournalIds = journalIds;
  mockFind.mockResolvedValue(auditResult(journalIds));
  mockFindByIds.mockImplementation((_workplace: WorkplaceId, journalIdsToCheck: string[]) =>
    Promise.resolve(
      auditResult(currentUnbalancedJournalIds.filter(id => journalIdsToCheck.includes(id))),
    ),
  );
}

describe('journalBalanceInsightService', () => {
  beforeEach(async () => {
    mockStorage.clear();
    auditReturns([]);
    await journalBalanceInsightService.refresh(workplaceId, 'hub');
    mockStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports the cleanup once, with the peak count and how long it stayed open', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-01T00:00:00Z') });
    auditReturns(['j1', 'j2', 'j3']);
    await journalBalanceInsightService.refresh(workplaceId, 'startup');
    auditReturns(['j1', 'j2', 'j3']);
    await journalBalanceInsightService.refresh(workplaceId, 'hub');
    auditReturns(['j3']);
    await journalBalanceInsightService.refresh(workplaceId, 'review_edit');
    expect(mockCleared).not.toHaveBeenCalled();

    jest.setSystemTime(new Date('2026-09-04T12:00:00Z'));
    auditReturns([]);
    await journalBalanceInsightService.refresh(workplaceId, 'review_fx_suggestions');
    await journalBalanceInsightService.refresh(workplaceId, 'startup');

    expect(mockCleared).toHaveBeenCalledTimes(1);
    expect(mockCleared).toHaveBeenCalledWith('unbalanced_journals_cleared', {
      peak_count: 3,
      days_open: 3,
      source: 'review_fx_suggestions',
    });
  });

  it('reports a cleanup noticed only on the next launch', async () => {
    auditReturns(['j1']);
    await journalBalanceInsightService.refresh(workplaceId, 'startup');
    jest.resetModules();
    const { journalBalanceInsightService: afterRestart } = jest.requireActual<
      typeof import('../journalBalanceInsightService')
    >('../journalBalanceInsightService');

    auditReturns([]);
    await afterRestart.refresh(workplaceId, 'startup');

    expect(mockFind).toHaveBeenCalledTimes(1);
    expect(mockFindByIds).toHaveBeenCalledWith(workplaceId, ['j1']);
    expect(mockCleared).toHaveBeenCalledWith('unbalanced_journals_cleared', {
      peak_count: 1,
      days_open: 0,
      source: 'startup',
    });
  });

  it('runs the full audit once, then only checks the persisted finding set', async () => {
    auditReturns(['j1']);
    await journalBalanceInsightService.refresh(workplaceId, 'startup');
    auditReturns(['j1']);
    await journalBalanceInsightService.refresh(workplaceId, 'hub');

    expect(mockFind).toHaveBeenCalledTimes(1);
    expect(mockFindByIds).toHaveBeenCalledTimes(1);
    expect(mockFindByIds).toHaveBeenCalledWith(workplaceId, ['j1']);
  });

  it('does not repeat a clean full audit after a restart', async () => {
    await journalBalanceInsightService.refresh(workplaceId, 'startup');
    jest.resetModules();
    const { journalBalanceInsightService: afterRestart } = jest.requireActual<
      typeof import('../journalBalanceInsightService')
    >('../journalBalanceInsightService');

    await afterRestart.refresh(workplaceId, 'startup');

    expect(mockFind).toHaveBeenCalledTimes(1);
    expect(mockFindByIds).toHaveBeenCalledWith(workplaceId, []);
  });

  it('runs a new full audit when the cached balance-rule version is stale', async () => {
    await journalBalanceInsightService.refresh(workplaceId, 'startup');
    const auditKey = `journal_balance_completed_audit_v1_${workplaceId}`;
    mockStorage.set(auditKey, JSON.stringify({ balanceRuleVersion: 0, unbalancedJournalIds: [] }));
    jest.clearAllMocks();
    auditReturns(['j1']);

    await journalBalanceInsightService.refresh(workplaceId, 'startup');

    expect(mockFind).toHaveBeenCalledTimes(1);
    expect(mockFindByIds).not.toHaveBeenCalled();
  });

  it('does not report a cleanup when nothing was unbalanced', async () => {
    await journalBalanceInsightService.refresh(workplaceId, 'startup');
    expect(mockCleared).not.toHaveBeenCalled();
  });

  it('publishes a notification until every journal balances', async () => {
    auditReturns(['j1', 'j2']);
    await journalBalanceInsightService.refresh(workplaceId, 'hub');

    const [insight] = journalBalanceInsightService.observe(workplaceId);
    expect(insight).toMatchObject({
      type: 'unbalanced-journals',
      severity: 'high',
      message: "2 entries don't balance",
      journalIds: ['j1', 'j2'],
    });

    auditReturns([]);
    await journalBalanceInsightService.refresh(workplaceId, 'hub');
    expect(journalBalanceInsightService.observe(workplaceId)).toEqual([]);
    expect(journalBalanceInsightService.hasIssues(workplaceId)).toBe(false);
  });

  it('keeps the snapshot and stays quiet when a refresh finds the same journals', async () => {
    auditReturns(['j1']);
    await journalBalanceInsightService.refresh(workplaceId, 'hub');
    const first = journalBalanceInsightService.observe(workplaceId);
    const listener = jest.fn();
    const unsubscribe = journalBalanceInsightService.subscribe(listener);

    await journalBalanceInsightService.refresh(workplaceId, 'hub');

    expect(journalBalanceInsightService.observe(workplaceId)).toBe(first);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('prompts once per distinct set of unbalanced journals', async () => {
    auditReturns(['j1', 'j2']);
    await journalBalanceInsightService.refresh(workplaceId, 'hub');
    expect(journalBalanceInsightService.claimPrompt(workplaceId)).not.toBeNull();
    expect(journalBalanceInsightService.claimPrompt(workplaceId)).toBeNull();

    auditReturns(['j2', 'j1']);
    await journalBalanceInsightService.refresh(workplaceId, 'hub');
    expect(journalBalanceInsightService.claimPrompt(workplaceId)).toBeNull();

    auditReturns(['j2']);
    await journalBalanceInsightService.refresh(workplaceId, 'hub');
    expect(journalBalanceInsightService.claimPrompt(workplaceId)).not.toBeNull();
  });
});
