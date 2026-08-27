export type FeatureEventMap = {
  journal:
    | 'create'
    | 'update'
    | 'delete'
    | 'recover'
    | 'post'
    | 'revert_to_planned'
    | 'duplicate'
    | 'reversal'
    | 'bulk_create'
    | 'suggestion_accepted';
  account:
    | 'create'
    | 'update'
    | 'delete'
    | 'recover'
    | 'merge'
    | 'reconcile'
    | 'reorder'
    | 'archive'
    | 'unarchive'
    | 'convert_type'
    | 'bulk_archive'
    | 'bulk_rename'
    | 'bulk_appearance'
    | 'bulk_move_hierarchy';
  import:
    | 'file_selected'
    | 'format_mismatch'
    | 'cancelled'
    | 'failed'
    | 'picker_cancelled'
    | 'picker_error'
    | 'completed';
  audit: 'view_entity' | 'revert_initiated' | 'revert_success' | 'revert_failed';
  hub: 'change_tab' | 'dismiss_insight' | 'restore_insight';
  reports: 'change_tab' | 'change_timeframe' | 'drilldown_transactions' | 'drilldown_category';
  voice_journal:
    | 'record_started'
    | 'permission_denied'
    | 'speech_error'
    | 'template_selected'
    | 'parsed'
    | 'parse_failed'
    | 'applied';
  sms:
    | 'rule_create'
    | 'rule_update'
    | 'rule_delete'
    | 'rule_toggle'
    | 'rule_test'
    | 'inbox_accept'
    | 'inbox_dismiss'
    | 'inbox_bulk_sync';
  budget: 'create' | 'update' | 'delete' | 'threshold_warning' | 'drilldown';
  planned_payment:
    | 'create'
    | 'update'
    | 'delete'
    | 'pause'
    | 'resume'
    | 'toggle_status'
    | 'post_now'
    | 'skip'
    | 'occurrence_paid'
    | 'occurrence_skipped';
  data_management:
    | 'export_initiated'
    | 'export_completed'
    | 'database_vacuum'
    | 'integrity_check'
    | 'factory_reset_initiated'
    | 'factory_reset_completed';
  dashboard: 'safe_to_spend_toggle' | 'quick_action' | 'networth_visibility_toggle';
  safe_to_spend:
    | 'opened'
    | 'closed'
    | 'section_expanded'
    | 'legend_pressed'
    | 'chart_point_selected'
    | 'planned_payment_viewed'
    | 'account_viewed'
    | 'legend_to_explanation';
  search: 'query_executed' | 'filters_applied' | 'result_selected';
  settings:
    | 'change_theme'
    | 'change_theme_preference'
    | 'change_font'
    | 'toggle_monthly_stats'
    | 'toggle_compact_account_picker'
    | 'toggle_privacy_mode'
    | 'toggle_widget_privacy'
    | 'toggle_app_lock'
    | 'switch_workplace'
    | 'create_workplace'
    | 'update_workplace_icon'
    | 'change_notification_cadence'
    | 'change_notification_time'
    | 'toggle_sms_import'
    | 'export_data'
    | 'integrity_check'
    | 'cleanup_database'
    | 'seed_mock_data'
    | 'open_telegram'
    | 'open_play_store'
    | 'open_github'
    | 'share_bug_report'
    | 'save_bug_report'
    | 'change_name'
    | 'change_archetype'
    | 'change_currency'
    | 'change_safe_to_spend_days'
    | 'toggle_safe_to_spend_chart';
  onboarding: 'completed' | 'step_continue';
  ai: 'model_load_success' | 'model_load_failure' | 'inference_completed' | 'inference_failed';
};

export type KnownFeature = keyof FeatureEventMap;
