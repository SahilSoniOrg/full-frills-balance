export type AnalyticsPropertyKind =
  'boolean' | 'count' | 'duration' | 'currency' | 'token' | 'version';

export const FEATURE_EVENT_CATALOG = {
  journal: {
    actions: [
      'create',
      'update',
      'delete',
      'recover',
      'post',
      'revert_to_planned',
      'duplicate',
      'reversal',
      'bulk_create',
      'suggestion_accepted',
    ] as const,
    schema: {
      mode: 'token',
      type: 'token',
      currency: 'currency',
      count: 'count',
      source: 'token',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  account: {
    actions: [
      'create',
      'update',
      'delete',
      'recover',
      'merge',
      'reconcile',
      'archive',
      'unarchive',
      'convert_type',
      'bulk_archive',
      'bulk_rename',
      'bulk_appearance',
      'bulk_move_hierarchy',
    ] as const,
    schema: {
      type: 'token',
      account_type: 'token',
      currency: 'currency',
      count: 'count',
      source: 'token',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  audit: {
    actions: ['view_entity', 'revert_initiated', 'revert_success', 'revert_failed'] as const,
    schema: {
      entity_type: 'token',
      success: 'boolean',
      reason: 'token',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  hub: {
    actions: ['change_tab', 'dismiss_insight', 'restore_insight'] as const,
    schema: { tab: 'token', action: 'token' } as const satisfies Record<
      string,
      AnalyticsPropertyKind
    >,
  },
  reports: {
    actions: ['change_tab', 'drilldown_transactions', 'drilldown_category'] as const,
    schema: {
      tab: 'token',
      timeframe: 'token',
      count: 'count',
      source: 'token',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  voice_journal: {
    actions: [
      'record_started',
      'permission_denied',
      'speech_error',
      'template_selected',
      'parsed',
      'parse_failed',
      'applied',
    ] as const,
    schema: {
      status: 'token',
      mode: 'token',
      duration_ms: 'duration',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  sms: {
    actions: [
      'rule_create',
      'rule_update',
      'rule_delete',
      'inbox_accept',
      'inbox_dismiss',
      'inbox_bulk_sync',
    ] as const,
    schema: {
      mode: 'token',
      status: 'token',
      count: 'count',
      success: 'boolean',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  budget: {
    actions: ['create', 'update', 'delete'] as const,
    schema: {
      currency: 'currency',
      count: 'count',
      threshold: 'token',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  planned_payment: {
    actions: [
      'create',
      'update',
      'delete',
      'toggle_status',
      'post_now',
      'skip',
      'occurrence_paid',
      'occurrence_skipped',
    ] as const,
    schema: {
      status: 'token',
      count: 'count',
      source: 'token',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  data_management: {
    actions: [
      'export_initiated',
      'export_completed',
      'database_vacuum',
      'integrity_check',
      'journal_balance_audit',
      'factory_reset_initiated',
      'factory_reset_completed',
    ] as const,
    schema: {
      format: 'token',
      count: 'count',
      success: 'boolean',
      table: 'token',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  safe_to_spend: {
    actions: [
      'opened',
      'closed',
      'section_expanded',
      'legend_pressed',
      'chart_point_selected',
      'planned_payment_viewed',
      'account_viewed',
      'legend_to_explanation',
    ] as const,
    schema: {
      section: 'token',
      item: 'token',
      slice: 'token',
      isOverCommitted: 'boolean',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  search: {
    actions: ['query_executed'] as const,
    schema: {
      scope: 'token',
      count: 'count',
      query_length: 'count',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  settings: {
    actions: [
      'change_theme',
      'change_theme_preference',
      'change_font',
      'change_hour_cycle',
      'toggle_monthly_stats',
      'toggle_compact_account_picker',
      'toggle_privacy_mode',
      'toggle_widget_privacy',
      'toggle_app_lock',
      'switch_workplace',
      'update_workplace_icon',
      'change_notification_cadence',
      'change_notification_time',
      'toggle_sms_import',
      'seed_mock_data',
      'open_telegram',
      'open_play_store',
      'open_github',
      'share_bug_report',
      'save_bug_report',
      'change_name',
      'change_currency',
      'change_safe_to_spend_days',
      'toggle_safe_to_spend_chart',
      'toggle_reduce_motion',
      'toggle_reports_v2',
    ] as const,
    schema: {
      enabled: 'boolean',
      visible: 'boolean',
      theme: 'token',
      font: 'token',
      cadence: 'token',
      hour: 'count',
      minute: 'count',
      weekday: 'count',
      currency_code: 'currency',
      days: 'count',
      icon: 'token',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
  journal_search: {
    actions: ['query_details'] as const,
    schema: {
      scope: 'token',
      count: 'count',
      query_length: 'count',
    } as const satisfies Record<string, AnalyticsPropertyKind>,
  },
} as const;

export type FeatureEventMap = {
  [
    Feature in keyof typeof FEATURE_EVENT_CATALOG
  ]: (typeof FEATURE_EVENT_CATALOG)[Feature]['actions'][number];
};

export type KnownFeature = keyof FeatureEventMap;
