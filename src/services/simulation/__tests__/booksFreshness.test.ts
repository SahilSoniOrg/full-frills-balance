import dayjs from 'dayjs';
import { booksGapDays, latestActiveJournalAt } from '@/src/services/simulation/booksFreshness';
import { JournalStatus } from '@/src/types/enums';

const now = dayjs('2026-11-03T15:00:00').valueOf();

function daysBefore(days: number): number {
  return dayjs('2026-11-03T15:00:00').subtract(days, 'day').valueOf();
}

describe('latest active journal tag', () => {
  it('has no tag when the books have no real transactions', () => {
    expect(latestActiveJournalAt([])).toBeNull();
    expect(booksGapDays(null, now)).toBeNull();
    expect(latestActiveJournalAt([{ status: JournalStatus.PLANNED, journalDate: now }])).toBeNull();
  });

  it('tags the newest posted journal and measures the gap from the check date', () => {
    const tagged = latestActiveJournalAt([
      { status: JournalStatus.POSTED, journalDate: daysBefore(2) },
    ]);
    expect(tagged).toBe(daysBefore(2));
    expect(booksGapDays(tagged, now)).toBe(2);
    expect(booksGapDays(tagged, dayjs(now).add(2, 'day').valueOf())).toBe(4);
  });

  it('ignores planned and draft entries when tagging the newest real transaction', () => {
    const tagged = latestActiveJournalAt([
      { status: JournalStatus.POSTED, journalDate: daysBefore(3) },
      { status: JournalStatus.PLANNED, journalDate: now },
      { status: JournalStatus.DRAFT, journalDate: now },
    ]);
    expect(booksGapDays(tagged, now)).toBe(3);
  });

  it('treats a reversal as fresh book data', () => {
    const tagged = latestActiveJournalAt([
      { status: JournalStatus.POSTED, journalDate: daysBefore(10) },
      { status: JournalStatus.REVERSED, journalDate: daysBefore(1) },
    ]);
    expect(booksGapDays(tagged, now)).toBe(1);
  });
});
