import { JournalStatus } from '@/src/data/models/Journal';
import { isRebuildEligibleJournalStatus } from '@/src/utils/journalActiveStatus';

describe('isRebuildEligibleJournalStatus', () => {
  it('treats undefined status as rebuild-eligible (posted default)', () => {
    expect(isRebuildEligibleJournalStatus(undefined)).toBe(true);
  });

  it('allows posted and reversed', () => {
    expect(isRebuildEligibleJournalStatus(JournalStatus.POSTED)).toBe(true);
    expect(isRebuildEligibleJournalStatus(JournalStatus.REVERSED)).toBe(true);
  });

  it('skips draft and planned statuses', () => {
    expect(isRebuildEligibleJournalStatus(JournalStatus.DRAFT)).toBe(false);
    expect(isRebuildEligibleJournalStatus(JournalStatus.PLANNED)).toBe(false);
  });
});
