import type { JournalId, WorkplaceId } from '@/src/types/ids';
import { journalBalanceInsightService } from '../journalBalanceInsightService';

const mockStorage = new Map<string, string>();
const mockCleared = jest.fn();
const mockFind = jest.fn();

// Mock state lives outside the factories so it survives jest.resetModules (a simulated relaunch).
jest.mock('../journalBalanceAudit', () => ({
  findUnbalancedJournals: (...args: unknown[]) => mockFind(...args),
}));
jest.mock('@/src/utils/storage', () => ({
  storage: {
    getString: (key: string) => mockStorage.get(key),
    set: (key: string, value: string) => mockStorage.set(key, value),
    remove: (key: string) => mockStorage.delete(key),
  },
}));
jest.mock('@/src/services/analytics', () => ({
  analytics: { logUnbalancedJournalsCleared: (...args: unknown[]) => mockCleared(...args) },
}));

const workplaceId = 'wp-insight' as WorkplaceId;

function auditReturns(journalIds: string[]) {
  mockFind.mockResolvedValue({
    journalsChecked: 10,
    unbalanced: journalIds.map(journalId => ({
      journal: { journalId: journalId as JournalId },
      evaluation: {},
    })),
  });
}

describe('journalBalanceInsightService', () => {
  beforeEach(async () => {
    mockStorage.clear();
    auditReturns([]);
    await journalBalanceInsightService.refresh(workplaceId, 'hub');
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports the cleanup once, with the peak count and how long it stayed open', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-01T00:00:00Z') });
    auditReturns(['j1', 'j2']);
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
    expect(mockCleared).toHaveBeenCalledWith(3, 3, 'review_fx_suggestions');
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

    expect(mockCleared).toHaveBeenCalledWith(1, 0, 'startup');
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

    auditReturns(['j1', 'j2', 'j3']);
    await journalBalanceInsightService.refresh(workplaceId, 'hub');
    expect(journalBalanceInsightService.claimPrompt(workplaceId)).not.toBeNull();
  });
});
