import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { asWorkplaceId } from '@/src/types/ids';
import { RestoreSummarySlice } from '../RestoreSummarySlice';
import type { RestoreSetupDraft } from '../setupTypes';

const draft: RestoreSetupDraft = {
  schemaVersion: 1,
  kind: 'restore',
  journeyId: 'settings_restore',
  entryPolicy: 'optional',
  operationId: asWorkplaceId('operation'),
  presentedHistory: ['restore_source', 'restore_summary'],
  acceptedSlices: ['restore_source', 'workplace'],
  restore: {
    sources: [
      {
        source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
        facts: { workplace: { name: 'Books' } },
        stats: { accounts: 2, journals: 1, transactions: 1, skippedTransactions: 0 },
        warnings: [],
      },
    ],
  },
  workplace: {
    name: { value: 'Books', source: 'imported' },
    icon: { value: 'briefcase', source: 'imported' },
    baseCurrency: { value: 'USD', source: 'imported' },
    selectedAccounts: [],
    selectedCategories: [],
    acceptedCheckpoints: ['identity', 'currency', 'accounts', 'categories'],
  },
};

describe('RestoreSummarySlice', () => {
  it('previews validated source data before publication', () => {
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

    expect(screen.getByText('Books is validated and ready to restore.')).toBeTruthy();
    expect(screen.getByTestId('restore-summary-secondary')).toBeEnabled();
    expect(screen.getByTestId('restore-summary-open')).toBeEnabled();
    fireEvent.press(screen.getByText('Discard'));
    expect(onIntent).toHaveBeenCalledWith('discard');
  });
});
