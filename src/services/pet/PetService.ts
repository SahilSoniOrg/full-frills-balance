import type { WidgetPetPayload } from '@/src/services/widget/WidgetPayload';

export class PetService {
  /**
   * Calculate pet health and mood based on audit deficit (pending inbox records)
   * and budget health (safe-to-spend remaining margin).
   *
   * @param unreviewedCount Number of pending transaction inbox records.
   * @param remainingMargin Safe-to-spend remaining margin (can be negative if shortfall).
   * @param safeToSpendRunwayDays Estimated safe to spend runway in days.
   */
  static calculatePetPayload(
    unreviewedCount: number,
    remainingMargin = 0,
    safeToSpendRunwayDays = 0,
  ): WidgetPetPayload {
    let baseHealth = 100;
    if (remainingMargin < 0) {
      baseHealth = Math.max(20, 100 - Math.min(80, Math.abs(remainingMargin) / 100));
    }

    const auditDeficitPenalty = unreviewedCount * 10;
    const petHealth = Math.min(100, Math.max(0, Math.round(baseHealth - auditDeficitPenalty)));

    let petMood: WidgetPetPayload['petMood'] = 'happy';
    if (petHealth <= 25) {
      petMood = 'asleep';
    } else if (petHealth <= 50) {
      petMood = 'hungry';
    } else if (petHealth >= 90) {
      petMood = 'ecstatic';
    }

    return {
      petHealth,
      petMood,
      unreviewedCount,
      safeToSpendRunwayDays,
    };
  }
}
