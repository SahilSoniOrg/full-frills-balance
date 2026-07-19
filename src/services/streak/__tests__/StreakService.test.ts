import Journal from '@/src/data/models/Journal';
import { StreakService } from '../StreakService';

describe('StreakService', () => {
  const refDate = new Date('2026-07-20T12:00:00Z');

  it('should return empty streak when no journals exist', () => {
    const result = StreakService.calculateStreak([], refDate);
    expect(result.streakCount).toBe(0);
    expect(result.todayLogged).toBe(false);
    expect(result.lastLoggedDate).toBeNull();
    expect(result.canRecoverMissedDays).toBe(false);
    expect(result.contributionMatrix).toHaveLength(60);
    expect(result.contributionMatrix?.every(v => v === false)).toBe(true);
  });

  it('should calculate consecutive streak when logged today and yesterday', () => {
    const mockJournals = [
      { journalDate: new Date('2026-07-20T10:00:00Z').getTime() },
      { journalDate: new Date('2026-07-19T10:00:00Z').getTime() },
      { journalDate: new Date('2026-07-18T10:00:00Z').getTime() },
    ] as Journal[];

    const result = StreakService.calculateStreak(mockJournals, refDate);
    expect(result.todayLogged).toBe(true);
    expect(result.streakCount).toBe(3);
    expect(result.lastLoggedDate).toBe('2026-07-20');
  });

  it('should calculate streak starting yesterday when not logged today', () => {
    const mockJournals = [
      { journalDate: new Date('2026-07-19T10:00:00Z').getTime() },
      { journalDate: new Date('2026-07-18T10:00:00Z').getTime() },
    ] as Journal[];

    const result = StreakService.calculateStreak(mockJournals, refDate);
    expect(result.todayLogged).toBe(false);
    expect(result.streakCount).toBe(2);
    expect(result.lastLoggedDate).toBe('2026-07-19');
  });

  it('should calculate contribution matrix of size 60', () => {
    const mockJournals = [
      { journalDate: new Date('2026-07-20T10:00:00Z').getTime() },
    ] as Journal[];

    const matrix = StreakService.calculateContributionMatrix(mockJournals, 60, refDate);
    expect(matrix).toHaveLength(60);
    // Index 59 is today (2026-07-20)
    expect(matrix[59]).toBe(true);
    expect(matrix[58]).toBe(false);
  });
});
