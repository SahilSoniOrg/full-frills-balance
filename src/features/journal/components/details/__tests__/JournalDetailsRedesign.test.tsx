import { render, fireEvent, act } from '@/src/utils/test-utils';
import { AppConfig } from '@/src/constants';
import { preferences } from '@/src/services/preferences';
import { buildJournalEntries, plannedMove } from '../../../journalDetailsPresentation';
import { mapJournalHistory } from '../../../journalHistoryPresentation';
import {
  journalDetailLeg,
  journalDetailEvaluation,
  journalDetailsFixture,
} from '../../../testing/journalDetailsFixtures';
import { JournalEntries } from '../JournalEntries';
import { JournalAccountingIssues } from '../JournalAccountingIssues';
import { JournalSummary } from '../JournalSummary';
import { JournalNote } from '../JournalNote';
import { JournalPlannedActions } from '../JournalPlannedActions';
import { JournalBudgetImpact } from '../JournalBudgetImpact';
import { JournalHistory } from '../JournalHistory';
import { JournalSource } from '../JournalSource';
import { AccountType, AuditAction, JournalDisplayType } from '@/src/types/enums';
import { asBudgetId } from '@/src/types/ids';
import { ConfirmDialog } from '@/src/components/overlays/ConfirmDialog';
import { revertEntry } from '@/src/services/audit-service';
import { toast } from '@/src/utils/alerts';
import { DetailHeaderMenuActions } from '@/src/components/shared/DetailHeaderMenuActions';
import { Icon } from '@/src/types/domainIcons';

jest.mock('@/src/components/overlays/ModalSurface', () => {
  const { ModalSurface: Actual } = jest.requireActual<
    typeof import('@/src/components/overlays/ModalSurface')
  >('@/src/components/overlays/ModalSurface');
  return {
    ModalSurface: (props: Parameters<typeof Actual>[0]) => (
      <Actual {...props} useNativeModal={false} />
    ),
  };
});

jest.mock('@/src/services/audit-service', () => ({ revertEntry: jest.fn() }));
jest.mock('@/src/utils/alerts', () => ({
  ...jest.requireActual('@/src/utils/alerts'),
  toast: { success: jest.fn(), error: jest.fn() },
}));

beforeEach(() => preferences.update({ isPrivacyMode: false }));
afterEach(() => preferences.update({ isPrivacyMode: false }));

it('shows only balance accounts after posted simple journals and keeps them tappable', () => {
  const onPress = jest.fn();
  const details = journalDetailsFixture();
  const items = [...details.entries.credits, ...details.entries.debits].map(item => ({
    ...item,
    onPress,
  }));
  const view = render(
    <JournalEntries
      entries={buildJournalEntries(items, 'INR', 'POSTED', details.balanceEvaluation)}
    />,
  );
  expect(view.getByText('AFTER THIS JOURNAL')).toBeTruthy();
  expect(view.getByText('Federal Fi')).toBeTruthy();
  expect(view.queryByText('Food & Drinks')).toBeNull();
  fireEvent.press(view.getByTestId('journal-entry-Federal Fi'));
  expect(onPress).toHaveBeenCalledTimes(1);
  view.rerender(
    <JournalEntries
      entries={buildJournalEntries(items, 'INR', 'PLANNED', details.balanceEvaluation)}
    />,
  );
  expect(view.queryByText('AFTER THIS JOURNAL')).toBeNull();
});

it('shows both account balances for transfers and none for category reclassifications', () => {
  const items = [journalDetailLeg('Bank'), journalDetailLeg('Card', AccountType.LIABILITY, false)];
  const view = render(<JournalEntries entries={buildJournalEntries(items, 'INR', 'POSTED')} />);
  expect(view.getByText('Balance')).toBeTruthy();
  expect(view.getByText('Owed')).toBeTruthy();
  view.rerender(
    <JournalEntries
      entries={buildJournalEntries(
        items.map(item => ({ ...item, accountType: AccountType.EXPENSE })),
        'INR',
        'POSTED',
      )}
    />,
  );
  expect(view.queryByTestId('journal-after-balances')).toBeNull();
});

it('shows native amounts, rates, notes and totals on splits, without partial totals', () => {
  const items = [
    journalDetailLeg('Bank'),
    {
      ...journalDetailLeg('USD Card'),
      currencyCode: 'USD',
      amount: 1,
      exchangeRate: 83.5,
      journalValue: 83.5,
      notes: 'Settle after the trip',
    },
    {
      ...journalDetailLeg('Travel', AccountType.EXPENSE, false),
      amount: 135.5,
      journalValue: 135.5,
    },
  ];
  const evaluation = journalDetailEvaluation(items);
  const view = render(
    <JournalEntries entries={buildJournalEntries(items, 'INR', 'POSTED', evaluation)} />,
  );
  expect(view.getByText(/@ 83.5/)).toBeTruthy();
  expect(view.getByText('Settle after the trip')).toBeTruthy();
  expect(view.getByText(/Balanced in INR/)).toBeTruthy();
  const missing = items.map(item =>
    item.id === 'USD Card' ? { ...item, exchangeRate: undefined, journalValue: undefined } : item,
  );
  view.rerender(
    <JournalEntries
      entries={buildJournalEntries(missing, 'INR', 'POSTED', journalDetailEvaluation(missing))}
    />,
  );
  expect(view.getByText('Value unavailable')).toBeTruthy();
  expect(view.getByText(/FROM · TOTAL UNAVAILABLE/)).toBeTruthy();
  expect(view.queryByText(/Balanced in INR/)).toBeNull();
});

it('omits accounting for balanced journals and makes incomplete accounting values unavailable', () => {
  const items = [journalDetailLeg('Bank'), journalDetailLeg('Food', AccountType.EXPENSE, false)];
  const view = render(<JournalAccountingIssues evaluation={journalDetailEvaluation(items)} />);
  expect(view.queryByTestId('journal-accounting-issues')).toBeNull();
  const unbalanced = items.map(item => (item.id === 'Food' ? { ...item, amount: 100 } : item));
  view.rerender(<JournalAccountingIssues evaluation={journalDetailEvaluation(unbalanced)} />);
  expect(view.getByText('Unbalanced')).toBeTruthy();
  const missing = [{ ...items[0], currencyCode: 'USD', exchangeRate: undefined }, items[1]];
  view.rerender(<JournalAccountingIssues evaluation={journalDetailEvaluation(missing)} />);
  expect(view.getAllByText('Unavailable')).toHaveLength(3);
  expect(view.getByText('Needs review')).toBeTruthy();
});

it('keeps notes wrapping and planned actions separate from balances', () => {
  const post = jest.fn(),
    skip = jest.fn();
  const details = journalDetailsFixture();
  const view = render(
    <>
      <JournalSummary
        journalId={details.journalId}
        summary={{ ...details.summary, statusLabel: 'Planned' }}
        entries={details.entries}
      />
      <JournalNote note={details.note} />
      <JournalPlannedActions
        planned={{
          move: plannedMove(details.entries, JournalDisplayType.EXPENSE, true),
          onPost: post,
          onSkip: skip,
        }}
      />
    </>,
  );
  expect(view.getByText(details.note!).props.numberOfLines).toBeUndefined();
  expect(view.getByText(/Not posted yet/)).toBeTruthy();
  fireEvent.press(view.getByTestId('journal-post'));
  fireEvent.press(view.getByTestId('journal-skip'));
  expect(post).toHaveBeenCalledTimes(1);
  expect(skip).toHaveBeenCalledTimes(1);
});

it('opens an account from the summary account flow', () => {
  const onPress = jest.fn();
  const details = journalDetailsFixture();
  const items = [...details.entries.credits, ...details.entries.debits].map(item => ({
    ...item,
    onPress,
  }));
  const view = render(
    <JournalSummary
      journalId={details.journalId}
      summary={details.summary}
      entries={buildJournalEntries(items, 'INR', 'POSTED', details.balanceEvaluation)}
    />,
  );
  fireEvent.press(view.getByRole('button', { name: 'Open Federal Fi' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('shows incomplete budget usage without a remaining amount or progress bar', () => {
  const budget = {
    budgetId: asBudgetId('food'),
    name: 'Eating out',
    currencyCode: 'INR',
    periodLabel: 'September 2026',
    usage: {
      spent: 2852,
      remaining: 3148,
      budgetAmount: 6000,
      usagePercent: 0.475,
      hasUnvaluedEntries: true,
    },
  };
  const view = render(
    <JournalBudgetImpact budget={{ budgets: [budget], error: false, onRetry: () => {} }} />,
  );
  expect(view.getByText(/September 2026 · Remaining unavailable/)).toBeTruthy();
  expect(JSON.stringify(view.toJSON())).not.toContain('3,148');
  expect(view.queryByRole('image')).toBeNull();
});

it('offers one revert, confirms first, and invokes only the selected event', async () => {
  const events = mapJournalHistory(
    [1, 2].map(timestamp => ({
      id: String(timestamp),
      timestamp,
      entityType: 'journal',
      entityId: 'journal',
      action: AuditAction.UPDATE,
      canRevert: true,
      changes: JSON.stringify({
        before: { description: 'Snack' },
        after: { description: 'Coffee' },
      }),
    })),
  );
  const revert = jest.mocked(revertEntry);
  revert.mockResolvedValueOnce({ success: false, error: 'Nope' });
  revert.mockResolvedValueOnce({ success: true });
  const { history } = journalDetailsFixture();
  const view = render(<JournalHistory history={{ ...history, events }} />);
  const dialog = () => view.UNSAFE_getByType(ConfirmDialog);
  expect(view.getAllByTestId('journal-revert-change')).toHaveLength(1);
  fireEvent.press(view.getByTestId('journal-revert-change'));
  expect(revert).not.toHaveBeenCalled();
  expect(dialog().props.visible).toBe(true);
  await act(async () => dialog().props.primaryAction.onPress());
  expect(revert).toHaveBeenLastCalledWith('2', history.workplaceId);
  expect(toast.error).toHaveBeenCalledWith('Nope');
  expect(dialog().props.visible).toBe(true);
  await act(async () => dialog().props.primaryAction.onPress());
  expect(revert).toHaveBeenCalledTimes(2);
  expect(toast.success).toHaveBeenCalled();
  expect(dialog().props.visible).toBe(false);
});

it('preserves legacy timestamps and distinguishes unavailable history from an empty trail', () => {
  const { history } = journalDetailsFixture();
  const view = render(<JournalHistory history={history} />);
  expect(view.getByText('Last updated')).toBeTruthy();
  view.rerender(<JournalHistory history={{ ...history, error: true }} />);
  expect(view.getByText('History unavailable')).toBeTruthy();
  expect(view.queryByText('Last updated')).toBeNull();
});

it('masks amounts and rates in splits, history and SMS, and hides the original body', () => {
  preferences.update({ isPrivacyMode: true });
  const items = [
    {
      ...journalDetailLeg('USD Card'),
      currencyCode: 'USD',
      amount: 12.34,
      exchangeRate: 83.577,
      journalValue: 1031.35,
      runningBalance: 18412.5,
    },
    journalDetailLeg('Travel', AccountType.EXPENSE, false),
  ];
  const events = mapJournalHistory([
    {
      id: 'money',
      timestamp: 1,
      entityType: 'journal',
      entityId: 'journal',
      action: AuditAction.UPDATE,
      canRevert: true,
      changes: JSON.stringify({
        before: { totalAmount: 12.34, currencyCode: 'USD' },
        after: { totalAmount: 52, currencyCode: 'USD' },
      }),
    },
  ]);
  const details = journalDetailsFixture();
  const view = render(
    <>
      <JournalEntries entries={buildJournalEntries(items, 'INR', 'POSTED')} />
      <JournalHistory history={{ ...details.history, events }} />
      <JournalSource
        source={{
          ...details.source,
          sms: [
            {
              sender: 'BANK',
              rawBody: 'Rs.52 debited',
              amount: 52,
              currencyCode: 'INR',
              inboxRecordId: 'sms',
            },
          ],
        }}
      />
    </>,
  );
  fireEvent.press(view.getByTestId('journal-source-row'));
  expect(view.getByText(AppConfig.strings.journalDetails.hiddenSms)).toBeTruthy();
  const tree = JSON.stringify(view.toJSON());
  expect(tree).not.toMatch(/12\.34|83\.577|18,412|Rs\.52/);
});

it('keeps Edit visible and Duplicate/Delete inside the shared overflow', () => {
  const edit = jest.fn(),
    copy = jest.fn(),
    remove = jest.fn();
  const view = render(
    <DetailHeaderMenuActions
      privacyPosition="leading"
      leadingActions={[
        {
          name: Icon.Edit,
          onPress: edit,
          testID: 'edit-button',
          accessibilityLabel: 'Edit journal',
        },
      ]}
      actions={[
        { label: 'Duplicate', onPress: copy, testID: 'copy-button' },
        { label: 'Delete journal', onPress: remove, testID: 'delete-button', destructive: true },
      ]}
    />,
  );
  fireEvent.press(view.getByTestId('edit-button'));
  expect(edit).toHaveBeenCalledTimes(1);
  expect(view.queryByTestId('delete-button')).toBeNull();
  fireEvent.press(view.getByTestId('detail-more-actions'));
  fireEvent.press(view.getByTestId('copy-button'));
  expect(copy).toHaveBeenCalledTimes(1);
});
