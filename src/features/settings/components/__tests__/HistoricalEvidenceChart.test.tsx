import { HistoricalEvidenceChart } from '@/src/features/settings/components/HistoricalEvidenceChart';
import {
  listHistoricalPatternEvidenceWindow,
  type HistoricalCategoryPattern,
  type HistoricalEvidenceEntry,
} from '@/src/services/transaction-intelligence/captureReviewService';
import { act, fireEvent, render, waitFor } from '@/src/testing/render';
import { asAccountId, asJournalId, asWorkplaceId } from '@/src/types/ids';
import dayjs from 'dayjs';

jest.mock('@/src/services/transaction-intelligence/captureReviewService', () => {
  const actual = jest.requireActual('@/src/services/transaction-intelligence/captureReviewService');
  return {
    ...actual,
    listHistoricalPatternEvidenceWindow: jest.fn(),
  };
});

describe('HistoricalEvidenceChart', () => {
  const food = asAccountId('food');
  const coffee = asAccountId('coffee');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes calendar-day pagination and exposes accessible page dots and day bars', async () => {
    const today = dayjs().startOf('day');
    const earliest = today.subtract(30, 'day').valueOf();
    const latest = today.valueOf();
    const entryDay = today.hour(12).valueOf();
    const pattern: HistoricalCategoryPattern = {
      key: 'shop',
      merchant: 'Shop',
      journalIds: [asJournalId('j1'), asJournalId('j2')],
      categoryByJournalId: { j1: food, j2: coffee },
      financialAccountId: asAccountId('cash'),
      financialAccountName: 'Cash',
      kind: 'expense',
      currencyCode: 'USD',
      earliestJournalDate: earliest,
      latestJournalDate: latest,
      journalCount: 2,
      sourceCount: 2,
      evidenceMarks: [],
      categories: [
        { accountId: food, name: 'Food', journalCount: 1 },
        { accountId: coffee, name: 'Coffee', journalCount: 1 },
      ],
    };
    const entries: HistoricalEvidenceEntry[] = [
      {
        journalId: asJournalId('j1'),
        journalDate: entryDay,
        categoryName: 'Food',
        sourceCount: 1,
        totalAmount: 12,
        currencyCode: 'USD',
      },
      {
        journalId: asJournalId('j2'),
        journalDate: entryDay,
        categoryName: 'Coffee',
        sourceCount: 1,
        totalAmount: 6,
        currencyCode: 'USD',
      },
    ];
    jest.mocked(listHistoricalPatternEvidenceWindow).mockResolvedValue(entries);
    const onSelectDay = jest.fn();

    const screen = render(
      <HistoricalEvidenceChart
        workplaceId={asWorkplaceId('wp')}
        pattern={pattern}
        revision={0}
        selectedCategoryId={null}
        selectedDayMs={null}
        onSelectDay={onSelectDay}
      />,
    );

    const pageButtons = screen.getAllByRole('button', { name: /Go to timeline page/i });
    expect(pageButtons.length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      fireEvent(screen.getByTestId('historical-evidence-chart'), 'layout', {
        nativeEvent: { layout: { width: 320 } },
      });
    });

    await waitFor(() => expect(listHistoricalPatternEvidenceWindow).toHaveBeenCalled());
    const dayBar = await screen.findByRole('button', {
      name: /Tap to see that day’s entries\./i,
    });
    fireEvent.press(dayBar);
    expect(onSelectDay).toHaveBeenCalledWith(expect.any(Number), entries);
  });
});
