import { Icon } from '@/src/types/domainIcons';
import { fireEvent, render, screen, waitFor } from '@/src/utils/test-utils';
import { asWorkplaceId } from '@/src/types/ids';
import { ThemeIds, FontIds } from '@/src/constants';
import type { ImportStats } from '@/src/services/import/types';
import { SetupSummarySlice } from '../SetupSummarySlice';
import { loadRestoreSummaries } from '../setupFinishers';
import type { RestoreSetupDraft } from '../setupTypes';

jest.mock('../setupFinishers', () => ({
  loadRestoreSummaries: jest.fn(),
}));

const load = loadRestoreSummaries as jest.MockedFunction<typeof loadRestoreSummaries>;

const restoreDraft = (stats: ImportStats): RestoreSetupDraft => ({
  schemaVersion: 1,
  kind: 'restore',
  journeyId: 'first_run_restore',
  entryPolicy: 'blocking',
  operationId: asWorkplaceId('operation'),
  presentedHistory: ['restore_source', 'restore_summary', 'device', 'appearance', 'summary'],
  acceptedSlices: ['restore_source', 'workplace', 'restore_summary', 'device', 'appearance'],
  restore: {
    sources: [
      {
        source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
        facts: { workplace: { name: 'Books', icon: Icon.Briefcase, defaultCurrencyCode: 'USD' } },
      },
    ],
    handoffs: [
      {
        operationId: asWorkplaceId('operation'),
        workplaceId: asWorkplaceId('operation'),
        fingerprint: 'abc',
        facts: { workplace: { name: 'Books' } },
        stats,
        warnings: [],
      },
    ],
  },
  device: { displayName: { value: 'Typed', source: 'user_entered' } },
  workplace: {
    name: { value: 'Books', source: 'imported' },
    icon: { value: Icon.Briefcase, source: 'imported' },
    baseCurrency: { value: 'USD', source: 'imported' },
    selectedAccounts: [],
    selectedCategories: [],
    acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
  },
  appearance: {
    themeId: { value: ThemeIds.DEEP_SPACE, source: 'user_entered' },
    fontId: { value: FontIds.DEEP_SPACE, source: 'user_entered' },
  },
});

describe('SetupSummarySlice', () => {
  beforeEach(() => {
    load.mockReset();
  });

  it('uses verified published counts for the restore summary', async () => {
    load.mockResolvedValue([
      {
        name: 'Books',
        icon: Icon.Briefcase,
        currency: 'USD',
        accounts: 4,
        categories: 6,
        journals: 2,
      },
    ]);
    const onConfirm = jest.fn();
    render(
      <SetupSummarySlice
        draft={restoreDraft({
          accounts: 4,
          categories: 6,
          journals: 2,
          transactions: 2,
          skippedTransactions: 0,
        })}
        isCompleting={false}
        onEdit={jest.fn()}
        onConfirm={onConfirm}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('4')).toBeTruthy());
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    fireEvent.press(screen.getByTestId('onboarding-finish-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('reads published book stats when the handoff still lumped categories into accounts', async () => {
    load.mockResolvedValue([
      {
        name: 'Books',
        icon: Icon.Briefcase,
        currency: 'USD',
        accounts: 4,
        categories: 6,
        journals: 2,
      },
    ]);

    render(
      <SetupSummarySlice
        draft={restoreDraft({
          accounts: 10,
          journals: 2,
          transactions: 2,
          skippedTransactions: 0,
        })}
        isCompleting={false}
        onEdit={jest.fn()}
        onConfirm={jest.fn()}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('4')).toBeTruthy());
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('blocks confirmation and offers retry when published counts cannot be verified', async () => {
    load.mockRejectedValue(new Error('database unavailable'));
    const onConfirm = jest.fn();
    render(
      <SetupSummarySlice
        draft={restoreDraft({
          accounts: 10,
          journals: 2,
          transactions: 2,
          skippedTransactions: 0,
        })}
        isCompleting={false}
        onEdit={jest.fn()}
        onConfirm={onConfirm}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('onboarding-summary-retry')).toBeTruthy());
    expect(screen.queryByTestId('onboarding-finish-button')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
