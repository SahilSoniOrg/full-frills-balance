import { fireEvent, render, screen, waitFor } from '@/src/utils/test-utils';
import { asWorkplaceId } from '@/src/types/ids';
import { RestoreSummarySlice } from '../RestoreSummarySlice';
import { loadRestoreSummary } from '../setupFinishers';
import type { RestoreSetupDraft } from '../setupTypes';

jest.mock('../setupFinishers', () => ({
  loadRestoreSummary: jest.fn(),
}));

const load = loadRestoreSummary as jest.MockedFunction<typeof loadRestoreSummary>;

const draft: RestoreSetupDraft = {
  schemaVersion: 1,
  kind: 'restore',
  journeyId: 'settings_restore',
  entryPolicy: 'optional',
  operationId: asWorkplaceId('operation'),
  presentedHistory: ['restore_source', 'restore_summary'],
  acceptedSlices: ['restore_source', 'workplace'],
  restore: {
    source: {
      source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
      facts: { workplace: { name: 'Books' } },
    },
    handoff: {
      operationId: asWorkplaceId('operation'),
      workplaceId: asWorkplaceId('operation'),
      fingerprint: 'abc',
      facts: { workplace: { name: 'Books' } },
      stats: { accounts: 2, journals: 1, transactions: 1, skippedTransactions: 0 },
      warnings: [],
    },
  },
};

describe('RestoreSummarySlice', () => {
  it('blocks Stay and Open after a failed read and still allows Discard', async () => {
    load.mockRejectedValue(new Error('db'));
    const onIntent = jest.fn();
    render(
      <RestoreSummarySlice
        draft={draft}
        actions={{
          primary: { intent: 'open', label: 'Open workplace' },
          secondary: { intent: 'stay', label: 'Stay here' },
        }}
        isCompleting={false}
        onIntent={onIntent}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('restore-summary-retry')).toBeTruthy());
    expect(screen.getByTestId('restore-summary-secondary')).toBeDisabled();
    expect(screen.getByTestId('restore-summary-open')).toBeDisabled();
    fireEvent.press(screen.getByText('Discard'));
    expect(onIntent).toHaveBeenCalledWith('discard');
  });
});
