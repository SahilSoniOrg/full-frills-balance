import { analytics } from '@/src/services/analytics';
import { journalBalanceInsightService } from '@/src/services/integrity';
import type { WorkplaceId } from '@/src/types/ids';
import { confirm } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { checkJournalBalancesOnStartup } from '../journalBalanceStartupCheck';

jest.mock('@/src/services/integrity', () => ({
  journalBalanceInsightService: { refresh: jest.fn(), claimPrompt: jest.fn() },
}));
jest.mock('@/src/services/analytics', () => ({
  analytics: { track: jest.fn() },
}));
jest.mock('@/src/utils/alerts', () => ({ confirm: { show: jest.fn() } }));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { toJournalBalanceReview: jest.fn() },
}));

const workplaceId = 'wp-1' as WorkplaceId;
const mockRefresh = journalBalanceInsightService.refresh as jest.Mock;
const mockClaimPrompt = journalBalanceInsightService.claimPrompt as jest.Mock;
const mockConfirm = confirm.show as jest.Mock;

async function showPrompt() {
  await checkJournalBalancesOnStartup(workplaceId, new AbortController().signal);
  return mockConfirm.mock.calls[0][0];
}

describe('checkJournalBalancesOnStartup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefresh.mockResolvedValue({ journalsChecked: 5, unbalanced: [{ journalId: 'j1' }] });
    mockClaimPrompt.mockReturnValue({ journalIds: ['j1', 'j2'] });
  });

  it('opens the balance review from Fix Now and records where it came from', async () => {
    const options = await showPrompt();

    expect(options).toMatchObject({ confirmText: 'Fix Now', cancelText: 'Later' });
    expect(options.message).toMatch(/2 posted entries/);
    options.onConfirm();
    expect(AppNavigation.toJournalBalanceReview).toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith('unbalanced_journals_prompt_answered', {
      choice: 'fix_now',
    });
    expect(analytics.track).toHaveBeenCalledWith('entrypoint_selected', {
      screen: 'app_start',
      entrypoint: 'startup_prompt',
      target: 'journal_balance_review',
    });
  });

  it('records Later and a dismissed popup separately', async () => {
    const options = await showPrompt();

    options.onCancel();
    options.onClose();

    expect(analytics.track).toHaveBeenCalledWith('unbalanced_journals_prompt_answered', {
      choice: 'later',
    });
    expect(analytics.track).toHaveBeenCalledWith('unbalanced_journals_prompt_answered', {
      choice: 'dismissed',
    });
    expect(AppNavigation.toJournalBalanceReview).not.toHaveBeenCalled();
  });

  it('reports the unbalanced count on every launch, even after the popup was shown', async () => {
    mockClaimPrompt.mockReturnValue(null);

    await checkJournalBalancesOnStartup(workplaceId, new AbortController().signal);

    expect(mockRefresh).toHaveBeenCalledWith(workplaceId, 'startup');
    expect(analytics.track).toHaveBeenCalledWith('journal_balance_checked', {
      unbalanced_count: 1,
      journals_checked: 5,
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('reports a zero count when every journal balances', async () => {
    mockRefresh.mockResolvedValue({ journalsChecked: 5, unbalanced: [] });
    mockClaimPrompt.mockReturnValue(null);

    await checkJournalBalancesOnStartup(workplaceId, new AbortController().signal);

    expect(analytics.track).toHaveBeenCalledWith('journal_balance_checked', {
      unbalanced_count: 0,
      journals_checked: 5,
    });
  });

  it('does not prompt after the workplace session is cancelled', async () => {
    const controller = new AbortController();
    mockRefresh.mockImplementation(async () => {
      controller.abort();
      return { journalsChecked: 5, unbalanced: [{ journalId: 'j1' }] };
    });

    await checkJournalBalancesOnStartup(workplaceId, controller.signal);

    expect(mockClaimPrompt).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
