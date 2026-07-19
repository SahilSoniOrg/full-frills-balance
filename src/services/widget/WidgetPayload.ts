/**
 * WidgetPayload — unified, minimal (<2KB JSON) snapshot contract
 * for iOS / Android home-screen widgets.
 *
 * Every field is nullable-optional-by-design so the observer can emit
 * a partial payload before all data sources have loaded.
 */

/** Streak-related widget data */
export interface WidgetStreakPayload {
  streakCount: number;
  lastLoggedDate: string | null; // ISO-8601 date, e.g. "2026-07-19"
  todayLogged: boolean;
  canRecoverMissedDays: boolean;
  missedDaysCount: number;
}

/** Pending SMS inbox item (null when inbox is empty) */
export interface WidgetPendingSmsPayload {
  id: string;
  merchant: string | null;
  amount: number;
  currency: string;
  timestamp: number; // epoch ms
  suggestedCategory: string | null;
}

/** Pet / companion widget data */
export interface WidgetPetPayload {
  petHealth: number; // 0–100
  petMood: 'happy' | 'hungry' | 'asleep' | 'ecstatic';
  unreviewedCount: number;
  safeToSpendRunwayDays: number;
}

/** Safe-to-spend widget data */
export interface WidgetSafeToSpendPayload {
  dailyAllowance: number;
  spentToday: number;
  remainingMargin: number;
}

/**
 * Top-level widget payload.
 * Total serialised JSON must be < 2 KB to keep UserDefaults/SharedPreferences
 * transfers fast.
 */
export interface WidgetPayload {
  streak: WidgetStreakPayload;
  pendingSms: WidgetPendingSmsPayload | null; // null when inbox is empty
  pet: WidgetPetPayload;
  safeToSpend: WidgetSafeToSpendPayload;
}
