import { PlannedPaymentDetailsView } from '../PlannedPaymentDetailsView';
import type { PlannedPaymentDetailsViewModel } from '../../hooks/usePlannedPaymentDetailsViewModel';
import { cleanup, fireEvent, render, within } from '@/src/utils/test-utils';
import { getThemeColors, ThemeIds } from '@/src/constants/design-tokens';
import { AccountType, JournalDisplayType, PlannedPaymentStatus } from '@/src/types/enums';
import type { AccountId, JournalId } from '@/src/types/ids';
import { Icon } from '@/src/types/domainIcons';
import { preferences } from '@/src/services/preferences';
import { AppConfig } from '@/src/constants';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';

jest.mock('@/src/features/journal', () => ({ JournalListModals: () => null }));

const day = (dayOfMonth: number, month = 9) => new Date(2026, month, dayOfMonth).getTime();
const row = (id: string, status: string, date: number, amount = 1250.45) => ({
  id: id as JournalId,
  status,
  journalDate: date,
  totalAmount: amount,
  currencyCode: 'USD',
  transactionCount: 1,
  displayType: JournalDisplayType.EXPENSE,
  accounts: [],
  description: 'Rent',
});

const vm: PlannedPaymentDetailsViewModel = {
  theme: getThemeColors(ThemeIds.DEEP_SPACE, 'light'),
  isLoading: false,
  isMissing: false,
  onBack: jest.fn(),
  onOpenJournal: jest.fn(),
  onOpenAccount: jest.fn(),
  selectedIds: new Set(),
  isSelectionModeActive: false,
  onLongPressItem: jest.fn(),
  toggleSelection: jest.fn(),
  selectAll: jest.fn(),
  clearItems: jest.fn(),
  exitSelectionMode: jest.fn(),
  onShareSelected: jest.fn(),
  nameText: 'Rent',
  amount: 1250.45,
  currencyCode: 'USD',
  rawAmount: 1250.45,
  rawName: 'Rent',
  typeLabel: 'Money out',
  typeColorKey: 'expense',
  iconName: Icon.ArrowDown,
  status: PlannedPaymentStatus.ACTIVE,
  statusText: 'Active',
  dueLabel: 'Due tomorrow',
  nextOccurrenceText: 'Oct 3, 2026',
  nextOccurrenceDate: day(3),
  showcasedOccurrenceDate: day(3),
  dueDate: day(3),
  intervalLabel: 'Monthly on day 3',
  startDateText: 'Jan 3, 2026',
  endDateText: 'Dec 3, 2026',
  startTimestamp: day(3, 0),
  endTimestamp: day(3, 11),
  remainingOccurrenceCount: 3,
  isAutoPost: false,
  description: 'Lease renewal in December',
  fromAccount: {
    id: 'checking' as AccountId,
    name: 'Checking',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
  },
  toAccount: {
    id: 'housing' as AccountId,
    name: 'Housing',
    accountType: AccountType.EXPENSE,
    currencyCode: 'USD',
  },
  onPost: jest.fn(),
  onSkip: jest.fn(),
  onToggleStatus: jest.fn(),
  hasMore: true,
  onLoadMore: jest.fn(),
  history: [
    row('paid', 'POSTED', day(1)),
    row('skipped', 'SKIPPED', day(2)),
    row('waiting', 'PLANNED', day(3)),
    row('reversed', 'REVERSED', day(4)),
  ],
  activitySummary: {
    recordedCount: 2,
    skippedCount: 1,
    reversedCount: 1,
    pendingCount: 1,
    pausedCount: 0,
    overdueCount: 1,
    recordedTotals: [
      { amount: 30000.5, currencyCode: 'USD' },
      { amount: 500, currencyCode: 'EUR' },
    ],
  },
  firstRecordedDate: day(1, 7),
  nextOccurrences: [
    { date: day(3), amount: 1250.45, currencyCode: 'USD' },
    { date: day(3, 10), amount: 1250.45, currencyCode: 'USD' },
    { date: day(3, 11), amount: 1300, currencyCode: 'USD' },
    { date: day(3, 0), amount: 1250.45, currencyCode: 'USD' },
  ],
};
const chrome: ScreenNavChrome = {
  screenTitle: 'Rent',
  showBack: true,
  backIcon: Icon.Back,
  onBack: jest.fn(),
};

describe('PlannedPaymentDetailsView', () => {
  beforeEach(() => {
    preferences.privacy.setIsPrivacyMode(false);
    jest.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    preferences.privacy.setIsPrivacyMode(false);
  });

  it('shows the edited occurrence, urgency, account drilldowns, and paired actions', () => {
    const screen = render(
      <PlannedPaymentDetailsView
        {...vm}
        chrome={chrome}
        occurrenceAmount={{ amount: 1199.95, currencyCode: 'USD' }}
      />,
    );

    expect(screen.getByText('Missed payment')).toBeTruthy();
    expect(screen.getByText(/Was due .*Oct 3/)).toBeTruthy();
    expect(screen.getByText(/edited, usually \$1,250\.45/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Open Checking' }));
    expect(vm.onOpenAccount).toHaveBeenCalledWith('checking');
  });

  it('shows three future dates, hides unchanged amounts, and shows edited currency amounts', () => {
    const screen = render(<PlannedPaymentDetailsView {...vm} chrome={chrome} />);
    expect(screen.getByText('Coming up')).toBeTruthy();
    expect(screen.getAllByText('Monthly on day 3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Nov 3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dec 3').length).toBeGreaterThan(0);
    expect(screen.getByText('$1,300.00')).toBeTruthy();
    expect(
      within(screen.getByTestId(`planned-upcoming-${day(3, 10)}`)).queryByText('$1,250.45'),
    ).toBeNull();
    expect(
      within(screen.getByTestId(`planned-upcoming-${day(3, 11)}`)).getByText('$1,300.00'),
    ).toBeTruthy();
  });

  it('shows grouped lifetime totals, status rows, See all, pagination and selection actions', () => {
    const screen = render(<PlannedPaymentDetailsView {...vm} chrome={chrome} />);
    expect(screen.getByText('$30,000.50')).toBeTruthy();
    expect(screen.getByText('€500.00')).toBeTruthy();
    expect(screen.getByText(/paid in 2 payments since Aug 2026/)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'See all 5' }));
    expect(screen.getAllByText('Skipped').length).toBeGreaterThan(0);
    expect(screen.getByText('Waiting')).toBeTruthy();
    expect(screen.getByText('Reversed')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Load earlier entries' }));
    expect(vm.onLoadMore).toHaveBeenCalledTimes(1);
    const paidRow = screen.getByTestId('planned-history-paid');
    fireEvent(paidRow, 'longPress');
    expect(vm.onLongPressItem).toHaveBeenCalledWith('paid');
  });

  it('shows the rule amount in its original currency when a payment used another currency', () => {
    const foreignPayment = { ...row('foreign-payment', 'POSTED', day(5), 90), currencyCode: 'EUR' };
    const screen = render(
      <PlannedPaymentDetailsView
        {...vm}
        chrome={chrome}
        history={[foreignPayment]}
        activitySummary={{
          ...vm.activitySummary!,
          recordedCount: 1,
          skippedCount: 0,
          reversedCount: 0,
          pendingCount: 0,
          pausedCount: 0,
          recordedTotals: [{ amount: 90, currencyCode: 'EUR' }],
        }}
      />,
    );
    expect(
      screen.getByText(/Paid in EUR; planned in another currency · Usual amount \$1,250\.45/),
    ).toBeTruthy();
  });

  it('keeps a changed journal title in the subtitle and accessible selection context', () => {
    const changedTitle = {
      ...row('renamed', 'POSTED', day(5)),
      description: 'Rent payment adjusted',
    };
    const screen = render(
      <PlannedPaymentDetailsView {...vm} chrome={chrome} history={[changedTitle]} />,
    );
    expect(screen.getByText('Rent payment adjusted')).toBeTruthy();
    expect(screen.getByTestId('planned-history-renamed').props.accessibilityLabel).toContain(
      'Rent payment adjusted',
    );
  });

  it('uses the supplied pause timestamp, hides upcoming and settlement actions, and offers resume', () => {
    const screen = render(
      <PlannedPaymentDetailsView
        {...vm}
        chrome={chrome}
        status={PlannedPaymentStatus.PAUSED}
        pausedSinceDate={day(2)}
        onPost={undefined}
        onSkip={undefined}
      />,
    );
    expect(screen.getByText('Since Oct 2')).toBeTruthy();
    expect(screen.queryByText('Coming up')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Resume schedule' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Resume schedule' }));
    expect(vm.onToggleStatus).toHaveBeenCalledTimes(1);
  });

  it('uses a neutral pause eyebrow when no audited pause timestamp is available', () => {
    const screen = render(
      <PlannedPaymentDetailsView
        {...vm}
        chrome={chrome}
        status={PlannedPaymentStatus.PAUSED}
        pausedSinceDate={undefined}
        onPost={undefined}
        onSkip={undefined}
      />,
    );
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Since /)).toBeNull();
  });

  it('shows ended totals without action controls or upcoming projections', () => {
    const screen = render(
      <PlannedPaymentDetailsView
        {...vm}
        chrome={chrome}
        status={PlannedPaymentStatus.COMPLETED}
        onPost={undefined}
        onSkip={undefined}
      />,
    );
    expect(screen.getAllByText('Ended').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/paid in 2 payments/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Coming up')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull();
  });

  it('keeps the Ends detail row for schedules without a finite end date', () => {
    const screen = render(
      <PlannedPaymentDetailsView {...vm} chrome={chrome} endTimestamp={undefined} />,
    );
    expect(screen.getByText('No end date')).toBeTruthy();
  });

  it('keeps the full history and action amounts private', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const screen = render(
      <PlannedPaymentDetailsView
        {...vm}
        chrome={chrome}
        occurrenceAmount={{ amount: 1199.95, currencyCode: 'USD' }}
      />,
    );
    expect(screen.getAllByText(AppConfig.privacyMask).length).toBeGreaterThan(0);
    expect(screen.queryByText('$1,199.95')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'See all 5' }));
    const paidRow = screen.getByTestId('planned-history-paid');
    expect(paidRow.props.accessibilityLabel).toContain(AppConfig.privacyMask);
    expect(paidRow.props.accessibilityLabel).not.toContain('1,250.45');
  });

  it('masks the expected rule amount for a cross-currency history row', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const foreignPayment = { ...row('foreign-private', 'POSTED', day(5), 90), currencyCode: 'EUR' };
    const screen = render(
      <PlannedPaymentDetailsView
        {...vm}
        chrome={chrome}
        history={[foreignPayment]}
        activitySummary={{
          ...vm.activitySummary!,
          recordedCount: 1,
          skippedCount: 0,
          reversedCount: 0,
          pendingCount: 0,
          pausedCount: 0,
          recordedTotals: [{ amount: 90, currencyCode: 'EUR' }],
        }}
      />,
    );
    const accessibleLabel = screen.getByTestId('planned-history-foreign-private').props
      .accessibilityLabel as string;
    expect(accessibleLabel).toContain(AppConfig.privacyMask);
    expect(accessibleLabel).not.toContain('1,250.45');
    expect(screen.getByText(new RegExp(`Usual amount ${AppConfig.privacyMask}`))).toBeTruthy();
  });

  it('disables record, skip and pause controls while a settlement is running', () => {
    const screen = render(
      <PlannedPaymentDetailsView {...vm} chrome={chrome} pendingAction="record" />,
    );
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pause schedule' })).toBeDisabled();
  });

  it('exposes action failures without hiding retryable controls', () => {
    const screen = render(
      <PlannedPaymentDetailsView
        {...vm}
        chrome={chrome}
        actionError="Could not record this occurrence. Try again."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not record this occurrence. Try again.',
    );
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeEnabled();
  });

  it('keeps the missing schedule state actionable', () => {
    const screen = render(
      <PlannedPaymentDetailsView {...vm} chrome={chrome} isMissing isLoading={false} />,
    );
    expect(screen.getByText('Planned payment not found')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
    expect(vm.onBack).toHaveBeenCalledTimes(1);
  });
});
