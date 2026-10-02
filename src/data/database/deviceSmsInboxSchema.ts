import { tableSchema } from '@nozbe/watermelondb';

/** Device data is deliberately excluded from Workplace export and deletion lists. */
export const deviceSmsInboxColumns = [
  { name: 'device_source_id', type: 'string', isIndexed: true },
  { name: 'provider_aliases_json', type: 'string', isOptional: true },
  { name: 'sender_address', type: 'string', isOptional: true },
  { name: 'raw_body', type: 'string', isOptional: true },
  { name: 'input_date', type: 'number', isIndexed: true },
  { name: 'input_fingerprint', type: 'string', isIndexed: true },
  { name: 'content_digest', type: 'string', isOptional: true, isIndexed: true },
  { name: 'parse_status', type: 'string' },
  { name: 'parsed_amount', type: 'number', isOptional: true },
  { name: 'parsed_currency_code', type: 'string', isOptional: true },
  { name: 'parsed_merchant', type: 'string', isOptional: true },
  { name: 'parsed_account_source', type: 'string', isOptional: true },
  { name: 'reference_number', type: 'string', isOptional: true },
  { name: 'direction', type: 'string' },
  { name: 'parse_confidence', type: 'number', isOptional: true },
  { name: 'parse_reason', type: 'string', isOptional: true },
  { name: 'review_states_json', type: 'string' },
  { name: 'notification_state', type: 'string', isIndexed: true },
  { name: 'notification_group_id', type: 'string', isOptional: true, isIndexed: true },
  { name: 'notification_origin', type: 'string' },
  { name: 'notification_workplace_id', type: 'string', isOptional: true },
  { name: 'first_seen_at', type: 'number' },
  { name: 'last_scanned_at', type: 'number' },
  { name: 'created_at', type: 'number' },
  { name: 'updated_at', type: 'number' },
] satisfies Parameters<typeof tableSchema>[0]['columns'];

export const deviceSmsInboxTable = tableSchema({
  name: 'device_sms_inbox_records',
  columns: deviceSmsInboxColumns,
});
