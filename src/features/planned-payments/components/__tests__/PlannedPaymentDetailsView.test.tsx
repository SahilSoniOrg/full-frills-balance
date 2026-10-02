import { PlannedPaymentDetailsView } from '../PlannedPaymentDetailsView';
import { PlannedPaymentDetailsViewModel } from '../../hooks/usePlannedPaymentDetailsViewModel';
import { render, fireEvent, cleanup } from '@/src/utils/test-utils';
import { getThemeColors, ThemeIds } from '@/src/constants/design-tokens';
import { AccountType, JournalDisplayType, PlannedPaymentStatus } from '@/src/types/enums';
import { AccountId, JournalId } from '@/src/types/ids';
import { Icon } from '@/src/types/domainIcons';
import { preferences } from '@/src/services/preferences';
import { AppConfig } from '@/src/constants';
import { ScreenNavChrome } from '@/src/components/layout/screenChrome';

jest.mock('@/src/features/journal', () => ({ JournalListModals: () => null }));

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
  statusVariant: 'success',
  dueLabel: 'Due tomorrow',
  dueColor: 'warning',
  nextOccurrenceText: 'Oct 3, 2026',
  intervalLabel: 'Monthly on day 3',
  startDateText: 'Jan 3, 2026',
  endDateText: 'Dec 3, 2026',
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
    {
      id: 'scheduled' as JournalId,
      status: 'PLANNED',
      journalDate: new Date(2026, 9, 3).getTime(),
      totalAmount: 1250.45,
      currencyCode: 'USD',
      transactionCount: 2,
      displayType: JournalDisplayType.EXPENSE,
      accounts: [],
      description: 'Rent',
    },
  ],
};
const chrome: ScreenNavChrome = {
  screenTitle: 'Planned payment details',
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

  it('shows schedule boundaries, notes, urgency and account drilldown', () => {
    const screen = render(<PlannedPaymentDetailsView {...vm} chrome={chrome} />);
    fireEvent.press(screen.getByRole('button', { name: 'Expand Schedule' }));
    expect(screen.getByText('Due tomorrow')).toBeTruthy();
    expect(screen.getByText('Jan 3, 2026')).toBeTruthy();
    expect(screen.getByText('Dec 3, 2026')).toBeTruthy();
    expect(screen.getByText('Lease renewal in December')).toBeTruthy();
    expect(screen.getByText('Manual')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Expand Account flow' }));
    fireEvent.press(screen.getByLabelText('Open Checking'));
    expect(vm.onOpenAccount).toHaveBeenCalledWith('checking');
    fireEvent.press(screen.getByRole('button', { name: 'Expand History' }));
    fireEvent.press(screen.getByText('Load earlier entries'));
    expect(vm.onLoadMore).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('Record occurrence'));
    expect(vm.onPost).toHaveBeenCalledTimes(1);
  });

  it('keeps generated entries out of recorded history and preserves selection', () => {
    const screen = render(<PlannedPaymentDetailsView {...vm} chrome={chrome} />);
    fireEvent.press(screen.getByRole('button', { name: 'Expand Scheduled occurrences' }));
    fireEvent.press(screen.getByRole('button', { name: 'Expand History' }));
    expect(screen.getByText('Scheduled occurrences')).toBeTruthy();
    expect(screen.getByText(/No recorded entries in the loaded activity/)).toBeTruthy();
    const card = screen.getByRole('button', { name: /Oct 3, 2026,/ });
    fireEvent(card, 'longPress');
    expect(vm.onLongPressItem).toHaveBeenCalledWith('scheduled');
    fireEvent.press(card);
    expect(vm.onOpenJournal).toHaveBeenCalledWith('scheduled');
  });

  it('offers resume for a paused schedule without dead record/skip buttons', () => {
    const screen = render(
      <PlannedPaymentDetailsView
        {...vm}
        chrome={chrome}
        status={PlannedPaymentStatus.PAUSED}
        statusText="Paused"
        onPost={undefined}
        onSkip={undefined}
      />,
    );
    expect(screen.queryByText('Record occurrence')).toBeNull();
    expect(screen.queryByText('Skip this occurrence')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Expand Schedule' }));
    fireEvent.press(screen.getByText('Resume schedule'));
    expect(vm.onToggleStatus).toHaveBeenCalledTimes(1);
  });

  it('masks money in both the headline and accessible history labels', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const screen = render(<PlannedPaymentDetailsView {...vm} chrome={chrome} />);
    fireEvent.press(screen.getByRole('button', { name: 'Expand Scheduled occurrences' }));
    expect(screen.getAllByText(AppConfig.privacyMask).length).toBeGreaterThanOrEqual(2);
    const card = screen.getByRole('button', { name: /Oct 3, 2026,/ });
    expect(card.props.accessibilityLabel).toContain(AppConfig.privacyMask);
    expect(card.props.accessibilityLabel).not.toContain('1,250.45');
  });

  it('shows all-history totals and an edited occurrence, with drilldowns to the exact saved journal', () => {
    const screen = render(
      <PlannedPaymentDetailsView
        {...vm}
        chrome={chrome}
        occurrenceAmount={{ amount: 1199.95, currencyCode: 'USD' }}
        outstandingJournalId={'older-unpaid' as JournalId}
        activitySummary={{
          recordedCount: 25,
          skippedCount: 2,
          reversedCount: 1,
          pendingCount: 1,
          overdueCount: 1,
          pausedCount: 0,
          recordedTotals: [{ amount: 30000.5, currencyCode: 'USD' }],
        }}
        nextOccurrences={[
          { date: new Date(2026, 10, 3).getTime(), amount: 1250.45, currencyCode: 'USD' },
        ]}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Expand Payment overview' }));
    fireEvent.press(screen.getByRole('button', { name: 'Expand Next occurrences' }));
    expect(screen.getByText('$1,199.95')).toBeTruthy();
    expect(screen.getByText('$30,000.50')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
    expect(screen.getByText('1 overdue')).toBeTruthy();
    expect(screen.getByText('Next occurrences')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Review this occurrence' }));
    expect(vm.onOpenJournal).toHaveBeenCalledWith('older-unpaid');
  });

  it('disables record, skip and schedule controls while settlement is running', () => {
    const screen = render(
      <PlannedPaymentDetailsView {...vm} chrome={chrome} pendingAction="record" />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Expand Schedule' }));
    expect(screen.getByRole('button', { name: 'Record occurrence' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip this occurrence' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pause schedule' })).toBeDisabled();
  });
});
