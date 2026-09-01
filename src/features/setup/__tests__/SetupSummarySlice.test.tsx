import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { asWorkplaceId } from '@/src/types/ids';
import { ThemeIds, FontIds } from '@/src/constants';
import { SetupSummarySlice } from '../SetupSummarySlice';
import type { RestoreSetupDraft } from '../setupTypes';

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
  it('uses restore handoff stats instead of a second publication read', () => {
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

    expect(screen.getByText('4')).toBeTruthy();
    fireEvent.press(screen.getByTestId('onboarding-finish-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
