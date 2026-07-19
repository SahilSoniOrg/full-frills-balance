import Journal from '@/src/data/models/Journal';
import type { WidgetStreakPayload } from '@/src/services/widget/WidgetPayload';

export class StreakService {
  /**
   * Calculate streak payload from a list of journals.
   */
  static calculateStreak(
    journals: Journal[],
    referenceDate: Date = new Date(),
  ): WidgetStreakPayload {
    const todayStr = referenceDate.toISOString().slice(0, 10);

    const journalDates = new Set<string>();
    for (const j of journals) {
      if (!j.journalDate) continue;
      const d = new Date(j.journalDate).toISOString().slice(0, 10);
      journalDates.add(d);
    }

    const todayLogged = journalDates.has(todayStr);

    let streakCount = 0;
    const sortedDates = [...journalDates].sort().reverse();
    const checkDate = new Date(referenceDate.getTime());

    if (!todayLogged) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    for (const dStr of sortedDates) {
      const expected = checkDate.toISOString().slice(0, 10);
      if (dStr === expected) {
        streakCount++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    const thirtyDaysAgo = new Date(referenceDate.getTime());
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);
    const recentDates = sortedDates.filter(d => d >= thirtyDaysAgoStr);
    let missedDaysCount = 30 - recentDates.length - (todayLogged ? 0 : 1);
    if (missedDaysCount < 0) missedDaysCount = 0;

    const canRecover = missedDaysCount <= 3 && missedDaysCount > 0;
    const contributionMatrix = this.calculateContributionMatrix(journals, 60, referenceDate);

    return {
      streakCount,
      lastLoggedDate: sortedDates.length > 0 ? sortedDates[0] : null,
      todayLogged,
      canRecoverMissedDays: canRecover,
      missedDaysCount,
      contributionMatrix,
    };
  }

  /**
   * Calculate a boolean contribution matrix array for the last `daysCount` days.
   * Index 0 is (daysCount - 1) days ago, index daysCount - 1 is referenceDate (today).
   */
  static calculateContributionMatrix(
    journals: Journal[],
    daysCount = 60,
    referenceDate: Date = new Date(),
  ): boolean[] {
    const journalDates = new Set<string>();
    for (const j of journals) {
      if (!j.journalDate) continue;
      journalDates.add(new Date(j.journalDate).toISOString().slice(0, 10));
    }

    const matrix: boolean[] = new Array(daysCount);
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(referenceDate.getTime());
      d.setDate(d.getDate() - (daysCount - 1 - i));
      const dateStr = d.toISOString().slice(0, 10);
      matrix[i] = journalDates.has(dateStr);
    }

    return matrix;
  }
}
