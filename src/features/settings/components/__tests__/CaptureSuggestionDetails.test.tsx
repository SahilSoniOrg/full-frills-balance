import {
  journalHistoricalCaptureQueries,
  type HistoricalCategoryPattern,
  type HistoricalEvidenceEntry,
} from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';
import { HistoricalPatternRow } from '@/src/features/settings/components/CaptureSuggestionDetails';
import type { TransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import { act, fireEvent, render, waitFor } from '@/src/testing/render';
import { asAccountId, asJournalId, asWorkplaceId } from '@/src/types/ids';

jest.mock('@/src/navigation/AppNavigation', () => ({ AppNavigation: {} }));

jest.mock('../HistoricalEvidenceChart', () => ({
  HistoricalEvidenceChart: () => null,
  historicalCategoryColor: () => '#888888',
  historicalCategoryMarkerShape: () => 'circle',
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

const ids = Array.from({ length: 10 }, (_, index) => asJournalId(`journal-${index}`));
const food = asAccountId('food');
const pattern: HistoricalCategoryPattern = {
  key: 'pattern',
  merchant: 'Shop',
  journalIds: ids,
  categoryByJournalId: Object.fromEntries(ids.map(id => [id, food])),
  financialAccountId: asAccountId('cash'),
  financialAccountName: 'Cash',
  kind: 'expense',
  currencyCode: 'USD',
  latestJournalDate: 10,
  journalCount: 10,
  sourceCount: 10,
  evidenceMarks: [],
  categories: [{ accountId: food, name: 'Food', journalCount: 10 }],
};
const capture = {
  workplaceId: asWorkplaceId('wp'),
  changeRevision: 0,
  busy: false,
  loading: false,
  onRetry: jest.fn(),
} as unknown as TransactionCaptureViewModel;

function entry(index: number): HistoricalEvidenceEntry {
  return {
    journalId: ids[index],
    journalDate: (index + 1) * 1000,
    categoryName: 'Food',
    sourceCount: 1,
    totalAmount: index + 1,
    currencyCode: 'USD',
  };
}

async function openEntriesDisclosure(screen: ReturnType<typeof render>, key = pattern.key) {
  fireEvent.press(screen.getByTestId(`historical-entries-disclosure-${key}`));
}

afterEach(() => jest.restoreAllMocks());

it('waits for the first page and reports filtered entries on a later page', async () => {
  const initial = deferred<HistoricalEvidenceEntry[]>();
  const query = jest
    .spyOn(journalHistoricalCaptureQueries, 'listPatternEvidenceEntries')
    .mockReturnValueOnce(initial.promise)
    .mockResolvedValueOnce([entry(9)]);
  const screen = render(
    <HistoricalPatternRow capture={capture} pattern={pattern} expanded onToggle={jest.fn()} />,
  );
  expect(query).not.toHaveBeenCalled();
  expect(screen.queryByText('Show more entries')).toBeNull();
  await openEntriesDisclosure(screen);
  expect(screen.queryByText('Show more entries')).toBeNull();
  await act(async () => {
    initial.resolve(ids.slice(0, 8).map((_, index) => entry(index)));
  });
  fireEvent.press(screen.getByText('Show more entries'));
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  expect(query.mock.calls[1].slice(2, 4)).toEqual([8, 8]);
  expect(await screen.findByText(/These entries changed or are no longer available/)).toBeTruthy();
  fireEvent.press(screen.getByText('Refresh suggestions'));
  expect(capture.onRetry).toHaveBeenCalled();
});

it('ignores a page that finishes after the evidence refreshes', async () => {
  const laterPage = deferred<HistoricalEvidenceEntry[]>();
  const query = jest
    .spyOn(journalHistoricalCaptureQueries, 'listPatternEvidenceEntries')
    .mockResolvedValueOnce(ids.slice(0, 8).map((_, index) => entry(index)))
    .mockReturnValueOnce(laterPage.promise)
    .mockResolvedValueOnce([entry(0)]);
  const screen = render(
    <HistoricalPatternRow capture={capture} pattern={pattern} expanded onToggle={jest.fn()} />,
  );
  await openEntriesDisclosure(screen);
  fireEvent.press(await screen.findByText('Show more entries'));
  expect(query).toHaveBeenCalledTimes(2);
  screen.rerender(
    <HistoricalPatternRow
      capture={{ ...capture, changeRevision: 1 }}
      pattern={pattern}
      expanded
      onToggle={jest.fn()}
    />,
  );
  await waitFor(() => expect(query).toHaveBeenCalledTimes(3));
  await act(async () => {
    laterPage.resolve([entry(8), entry(9)]);
  });
  expect(screen.getByTestId('historical-evidence-journal-0')).toBeTruthy();
  expect(screen.queryByTestId('historical-evidence-journal-8')).toBeNull();
  expect(screen.queryByTestId('historical-evidence-journal-9')).toBeNull();
});

it('explains why a different saved category cannot be replaced', () => {
  jest.spyOn(journalHistoricalCaptureQueries, 'listPatternEvidenceEntries').mockResolvedValue([]);
  const existing = {
    key: pattern.key,
    categoryAccountId: asAccountId('other'),
    conflicted: false,
  } as TransactionCaptureViewModel['categoryDefaults'][number];
  const screen = render(
    <HistoricalPatternRow
      capture={{ ...capture, categoryDefaults: [existing] }}
      pattern={pattern}
      expanded
      onToggle={jest.fn()}
    />,
  );
  expect(screen.getByText(/A different category is already saved/)).toBeTruthy();
  expect(screen.queryByText('Save default')).toBeNull();
});

it('directs conflicted saved categories to resolution', () => {
  jest.spyOn(journalHistoricalCaptureQueries, 'listPatternEvidenceEntries').mockResolvedValue([]);
  const existing = {
    key: pattern.key,
    categoryAccountId: food,
    conflicted: true,
  } as TransactionCaptureViewModel['categoryDefaults'][number];
  const screen = render(
    <HistoricalPatternRow
      capture={{ ...capture, categoryDefaults: [existing] }}
      pattern={pattern}
      expanded
      onToggle={jest.fn()}
    />,
  );
  expect(screen.getByText(/Resolve the conflict in Saved defaults/)).toBeTruthy();
  expect(screen.queryByText('Save default')).toBeNull();
});
