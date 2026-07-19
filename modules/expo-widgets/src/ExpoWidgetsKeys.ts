/**
 * Single source of truth contract for native widget preference/defaults keys.
 */
export const WIDGET_KEYS = {
  PREFS_NAME: 'full_frills_balance_widgets',
  APP_GROUP_ID: 'group.in.sahilsoni.fullfrillsbalance.widgets',
  MAX_PENDING_SMS: 5,

  // Safe to spend
  SAFE_TO_SPEND_AMOUNT: 'safe_to_spend_amount',
  SAFE_TO_SPEND_CURRENCY: 'safe_to_spend_currency',
  SAFE_TO_SPEND_FORMATTED_AMOUNT: 'safe_to_spend_formatted_amount',
  SAFE_TO_SPEND_TITLE: 'safe_to_spend_title',
  SAFE_TO_SPEND_SUBTITLE: 'safe_to_spend_subtitle',
  SAFE_TO_SPEND_UPDATED_AT: 'safe_to_spend_updated_at',

  // Theme
  THEME_ID: 'widget_theme_id',
  THEME_MODE: 'widget_theme_mode',
  THEME_BACKGROUND_START: 'widget_theme_background_start',
  THEME_BACKGROUND_END: 'widget_theme_background_end',
  THEME_TITLE_COLOR: 'widget_theme_title_color',
  THEME_PRIMARY_TEXT_COLOR: 'widget_theme_primary_text_color',
  THEME_SECONDARY_TEXT_COLOR: 'widget_theme_secondary_text_color',
  THEME_ACTION_ICON_COLOR: 'widget_theme_action_icon_color',
  THEME_INCOME_ACCENT_COLOR: 'widget_theme_income_accent_color',
  THEME_EXPENSE_ACCENT_COLOR: 'widget_theme_expense_accent_color',
  THEME_TRANSFER_ACCENT_COLOR: 'widget_theme_transfer_accent_color',

  // Privacy
  IS_PRIVACY_ENABLED: 'widget_is_privacy_enabled',

  // Streak
  STREAK_COUNT: 'streak_count',
  STREAK_TODAY_LOGGED: 'streak_today_logged',
  STREAK_LAST_LOGGED_DATE: 'streak_last_logged_date',
  STREAK_CAN_RECOVER: 'streak_can_recover',
  STREAK_MISSED_DAYS: 'streak_missed_days',

  // Pending SMS
  PENDING_SMS_COUNT: 'pending_sms_count',
  PENDING_SMS_PREFIX: 'pending_sms_',

  // Pet
  PET_HEALTH: 'pet_health',
  PET_MOOD: 'pet_mood',
  PET_LEVEL: 'pet_level',
} as const;
