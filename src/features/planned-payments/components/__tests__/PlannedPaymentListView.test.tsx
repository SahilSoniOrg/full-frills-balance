import { PlannedPaymentListView } from '@/src/features/planned-payments/components/PlannedPaymentListView';
import { AppConfig } from '@/src/constants';
import { preferences } from '@/src/services/preferences';
import { buildPlannedPaymentListPresentation } from '@/src/features/planned-payments/hooks/plannedPaymentListPresentation';
import type {
  PlannedPaymentObligation,
  PlannedPaymentSavedOccurrence,
} from '@/src/services/planned-payment/plannedPaymentReadService';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import type { AccountId, JournalId, PlannedPaymentId } from '@/src/types/ids';
import { fireEvent, render } from '@/src/utils/test-utils';
import { StyleSheet, View } from 'react-native';

jest.mock('@/src/features/planned-payments/hooks/usePlannedListRecord', () => ({
  usePlannedListRecord: () => ({
    recordOccurrence: jest.fn(),
    pendingIds: new Set<string>(),
    pendingPlanIds: new Set<string>(),
    errors: {},
  }),
}));

jest.mock('@shopify/flash-list', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, contentContainerStyle }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => import('react').ReactNode;
      ListHeaderComponent?: import('react').ReactNode;
      ListEmptyComponent?: import('react').ReactNode;
      contentContainerStyle?: import('react-native').StyleProp<import('react-native').ViewStyle>;
    }) => ReactActual.createElement(
        View,
        { style: contentContainerStyle },
        ListHeaderComponent,
        ...(data.length
          ? data.map((item, index) => renderItem({ item, index }))
          : [ListEmptyComponent]),
      ),
  };
});

const date = (day: number) => new Date(2026, 9, day).getTime();
const payment = (
  status: PlannedPaymentStatus,
  overrides: Partial<PlannedPaymentObligation> = {},
): PlannedPaymentObligation => ({
  id: 'plan' as PlannedPaymentId,
  name: 'Rent',
  amount: 725.25,
  currencyCode: 'EUR',
  fromAccountId: 'cash' as AccountId,
  toAccountId: 'rent' as AccountId,
  intervalN: 1,
  intervalType: PlannedPaymentInterval.MONTHLY,
  startDate: date(1),
  nextOccurrence: date(1),
  status,
  isAutoPost: false,
  flowDirection: 'outflow',
  ...overrides,
});
const saved = (planId: PlannedPaymentId, due: number): PlannedPaymentSavedOccurrence => ({
  journalId: 'saved-rent' as JournalId,
  plannedPaymentId: planId,
  date: due,
  amount: 725.25,
  currencyCode: 'EUR',
});

function renderList(items: PlannedPaymentObligation[], savedOccurrences: PlannedPaymentSavedOccurrence[] = []) {
  const now = date(4);
  const listData = buildPlannedPaymentListPresentation(
    { items, savedOccurrences },
    'USD',
    now,
  );
  return render(
    <PlannedPaymentListView
      listData={listData}
      isLoading={false}
      error={null}
      onRetry={jest.fn()}
      onItemPress={jest.fn()}
    />,
  );
}

describe('PlannedPaymentListView disclosure and privacy', () => {
  beforeEach(() => {
    preferences.privacy.setIsPrivacyMode(false);
  });
  afterEach(() => {
    preferences.privacy.setIsPrivacyMode(false);
  });

  it('hides the Paused / Ended disclosure when that group is empty', () => {
    const { queryByRole, getByText } = renderList([]);
    expect(getByText(AppConfig.strings.plannedPayments.emptyTitle)).toBeTruthy();
    expect(queryByRole('button', { name: AppConfig.strings.plannedListRedesign.expandPausedEnded })).toBeNull();
  });

  it('keeps paused and ended schedules behind the collapsed disclosure', () => {
    const { getByRole, getByText, queryByText } = renderList([
      payment(PlannedPaymentStatus.PAUSED),
      payment(PlannedPaymentStatus.COMPLETED, {
        name: 'Extended schedule',
        intervalN: 2,
      }),
    ]);
    const disclosure = getByRole('button', {
      name: AppConfig.strings.plannedListRedesign.expandPausedEnded,
    });
    expect(queryByText('Rent')).toBeNull();
    fireEvent.press(disclosure);
    expect(getByText('Rent')).toBeTruthy();
    expect(getByText('Extended schedule')).toBeTruthy();
    expect(getByText('Paused')).toBeTruthy();
    expect(getByText('Ended · Every 2 months')).toBeTruthy();
  });

  it('reserves the floating action button footprint after the last row', () => {
    const { UNSAFE_getAllByType } = renderList([]);
    const listContainer = UNSAFE_getAllByType(View).find(
      view => StyleSheet.flatten(view.props.style)?.paddingBottom === 128,
    );
    expect(listContainer).toBeTruthy();
  });

  it('masks row money in visible and accessible list output', () => {
    preferences.privacy.setIsPrivacyMode(true);
    const { getAllByText, getByRole, queryByText } = renderList(
      [payment(PlannedPaymentStatus.COMPLETED)],
      [saved('plan' as PlannedPaymentId, date(1))],
    );
    expect(getAllByText(AppConfig.privacyMask).length).toBeGreaterThan(0);
    expect(queryByText(/725/)).toBeNull();
    expect(
      getByRole('button', { name: /^Record Rent/ }).props.accessibilityLabel,
    ).toContain(AppConfig.privacyMask);
  });
});
