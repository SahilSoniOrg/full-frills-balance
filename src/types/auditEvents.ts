import { AUDIT_ENTITY_TYPES } from '@/src/types/enums';
import type { AuditAction, AuditEntityType } from '@/src/types/enums';

export const AUDIT_EVENT_SCHEMA_VERSION = 2 as const;

export const DEFAULT_AUDIT_ACTIONS = ['create', 'update', 'delete'] as const;

/**
 * Non-CRUD event names emitted by current writers, plus legacy aliases retained for imports.
 * Add new domain events here so writers get compile-time validation and the UI can label them.
 */
export const AUDIT_DOMAIN_EVENT_TYPES = [
  'account.created',
  'account.imported',
  'account.updated',
  'account.deleted',
  'account.group_disbanded',
  'account.restored',
  'account.reverted',
  'account.archived',
  'account.unarchived',
  'account.merged',
  'account.merged_into',
  'account.hierarchy_retargeted',
  'account.payment_source_retargeted',
  'account.reconciled',
  'account.balance_repaired',
  'journal.created',
  'journal.sms_auto_posted',
  'journal.imported',
  'journal.updated',
  'journal.deleted',
  'journal.restored',
  'journal.posted',
  'journal.reversed',
  'journal.reversal_created',
  'journal.planned_payment_generated',
  'journal.planned_payment_skipped',
  'journal.opening_balance_created',
  'journal.renamed',
  'journal.reverted',
  'journal.reverted_to_planned',
  'journal.status_changed',
  'journal.accounts_retargeted',
  'exchange_rate.manual_set',
  'budget.created',
  'budget.imported',
  'budget.updated',
  'budget.deleted',
  'budget.restored',
  'budget.reverted',
  'budget.accounts_retargeted',
  'planned_payment.created',
  'planned_payment.imported',
  'planned_payment.deleted',
  'planned_payment.updated',
  'planned_payment.completed',
  'planned_payment.accounts_retargeted',
  'planned_payment.status_changed',
  'planned_payment.schedule_advanced',
  'planned_payment.reverted',
  'transaction_auto_post_rule.created',
  'transaction_auto_post_rule.imported',
  'transaction_auto_post_rule.updated',
  'transaction_auto_post_rule.deleted',
  'transaction_auto_post_rule.accounts_retargeted',
  'transaction_inbox_record.created',
  'transaction_inbox_record.updated',
  'transaction_inbox_record.linked',
  'transaction_inbox_record.status_changed',
  'transaction_inbox_record.imported',
  'workplace.created',
  'workplace.updated',
  'workplace.restored',
  'workplace.currency_migrated',
  'workplace.reverted',
] as const satisfies readonly `${AuditEntityType}.${string}`[];

export type AuditEventType =
  | `${AuditEntityType}.${(typeof DEFAULT_AUDIT_ACTIONS)[number]}`
  | (typeof AUDIT_DOMAIN_EVENT_TYPES)[number];

export const AUDIT_EVENT_TYPES: readonly AuditEventType[] = [
  ...AUDIT_ENTITY_TYPES.flatMap(entityType =>
    DEFAULT_AUDIT_ACTIONS.map(action => `${entityType}.${action}` as AuditEventType),
  ),
  ...AUDIT_DOMAIN_EVENT_TYPES,
];

export type AuditJsonValue = string | number | boolean | null | AuditJsonObject | AuditJsonValue[];

export interface AuditJsonObject {
  [key: string]: AuditJsonValue;
}

export interface AuditFieldDelta {
  before: AuditJsonValue;
  after: AuditJsonValue;
}

export type AuditEventSource = 'app' | 'system' | 'import' | 'repair' | (string & {});

export interface AuditEventMetadata {
  eventType?: AuditEventType;
  source?: AuditEventSource;
  correlationId?: string;
  revertsLogId?: string;
  undoable?: boolean;
}

export interface AuditActor {
  id?: string;
  idScope?: 'local-install' | 'account' | 'organization' | (string & {});
  label?: string;
  type?: 'user' | 'system' | 'unknown' | (string & {});
}

interface AuditEventPayloadBase {
  eventType: string;
  source: AuditEventSource;
  displayName?: string;
  /** Currency context for financial fields, including when the currency did not change. */
  currencyCode?: string;
  actor?: AuditActor;
  correlationId?: string;
  revertsLogId?: string;
  undoable: boolean;
  details: AuditJsonObject;
  before?: AuditJsonObject;
  after?: AuditJsonObject;
}

/** Versioned payload stored in audit_logs.changes. Legacy payloads remain readable. */
export interface LegacyAuditEventPayload extends AuditEventPayloadBase {
  schemaVersion: 1;
  fields: Record<string, AuditFieldDelta>;
}

export interface CompactAuditEventPayload extends AuditEventPayloadBase {
  schemaVersion: typeof AUDIT_EVENT_SCHEMA_VERSION;
  action: AuditAction;
}

export type AuditEventPayload = LegacyAuditEventPayload | CompactAuditEventPayload;

export interface AuditEventInput {
  entityType: AuditEntityType;
  action: AuditAction;
  changes: unknown;
  displayName?: string;
  eventType?: AuditEventType;
  source?: AuditEventSource;
  actor?: AuditActor;
  correlationId?: string;
  revertsLogId?: string;
  undoable?: boolean;
}
