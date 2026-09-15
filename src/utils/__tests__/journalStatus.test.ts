import { JournalStatus } from '@/src/types/enums';
import { isActiveJournalStatus, isRebuildEligibleJournalStatus } from '@/src/utils/journalStatus';

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

describe('isActiveJournalStatus', () => {
  it('narrows active statuses separately from other known statuses', () => {
    expect(isActiveJournalStatus(JournalStatus.POSTED)).toBe(true);
    expect(isActiveJournalStatus(JournalStatus.DRAFT)).toBe(false);
    expect(isActiveJournalStatus('not-a-status')).toBe(false);
  });
});
