import { JournalStatus } from '@/src/types/domain';
import { isRebuildEligibleJournalStatus } from '@/src/utils/journalActiveStatus';
import { isActiveJournalStatus, isJournalStatus } from '@/src/utils/journalStatus';

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

describe('isJournalStatus', () => {
  it('narrows known persisted statuses and rejects unknown values', () => {
    expect(isJournalStatus(JournalStatus.POSTED)).toBe(true);
    expect(isJournalStatus('not-a-status')).toBe(false);
    expect(isJournalStatus(undefined)).toBe(false);
  });

  it('narrows active statuses separately from other known statuses', () => {
    expect(isActiveJournalStatus(JournalStatus.POSTED)).toBe(true);
    expect(isActiveJournalStatus(JournalStatus.DRAFT)).toBe(false);
    expect(isActiveJournalStatus('not-a-status')).toBe(false);
  });
});
