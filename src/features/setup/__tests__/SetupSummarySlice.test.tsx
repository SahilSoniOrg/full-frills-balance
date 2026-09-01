import { fireEvent, render, screen, waitFor } from '@/src/utils/test-utils';
import { asWorkplaceId } from '@/src/types/ids';
import { ThemeIds, FontIds } from '@/src/constants';
import { SetupSummarySlice } from '../SetupSummarySlice';
import { loadRestoreSummary } from '../setupFinishers';
import type { RestoreSetupDraft } from '../setupTypes';

jest.mock('../setupFinishers', () => ({
  loadRestoreSummary: jest.fn(),
}));

const load = loadRestoreSummary as jest.MockedFunction<typeof loadRestoreSummary>;

const restoreDraft: RestoreSetupDraft = {
  schemaVersion: 1,
  kind: 'restore',
  journeyId: 'first_run_restore',
  entryPolicy: 'blocking',
  operationId: asWorkplaceId('operation'),
  presentedHistory: ['restore_source', 'restore_summary', 'device', 'appearance', 'summary'],
  acceptedSlices: ['restore_source', 'workplace', 'restore_summary', 'device', 'appearance'],
  restore: {
    source: {
      source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
      facts: { workplace: { name: 'Books', icon: 'briefcase', defaultCurrencyCode: 'USD' } },
    },
    handoff: {
      operationId: asWorkplaceId('operation'),
      workplaceId: asWorkplaceId('operation'),
      fingerprint: 'abc',
      facts: { workplace: { name: 'Books' } },
      stats: { accounts: 4, journals: 2, transactions: 2, skippedTransactions: 0 },
      warnings: [],
    },
  },
  device: { displayName: { value: 'Typed', source: 'user_entered' } },
  workplace: {
    name: { value: 'Books', source: 'imported' },
    icon: { value: 'briefcase', source: 'imported' },
    baseCurrency: { value: 'USD', source: 'imported' },
    selectedAccounts: [],
    selectedCategories: [],
    acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
  },
  appearance: {
    themeId: { value: ThemeIds.DEEP_SPACE, source: 'user_entered' },
    fontId: { value: FontIds.DEEP_SPACE, source: 'user_entered' },
  },
};

describe('SetupSummarySlice', () => {
  beforeEach(() => {
    load.mockReset();
  });

  it('blocks Confirm and does not show zero counts while imported books are unread', async () => {
    load.mockResolvedValue(undefined);
    const onConfirm = jest.fn();
    render(
      <SetupSummarySlice
        draft={restoreDraft}
        isCompleting={false}
        onEdit={jest.fn()}
        onConfirm={onConfirm}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('onboarding-summary-retry')));
    expect(screen.queryByTestId('onboarding-finish-button')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
    fireEvent.press(screen.getByTestId('onboarding-summary-retry'));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('onboarding-summary-retry')).toBeTruthy());
    expect(screen.queryByTestId('onboarding-finish-button')).toBeNull();
  });

  it('shows published counts and Confirm only after a successful read', async () => {
    load.mockResolvedValue({
      name: 'Books',
      icon: 'briefcase',
      currency: 'USD',
      accounts: 4,
      categories: 6,
      journals: 2,
    });
    const onConfirm = jest.fn();
    render(
      <SetupSummarySlice
        draft={restoreDraft}
        isCompleting={false}
        onEdit={jest.fn()}
        onConfirm={onConfirm}
        onBack={jest.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('4')));
    expect(screen.getByText('6')).toBeTruthy();
    fireEvent.press(screen.getByTestId('onboarding-finish-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
