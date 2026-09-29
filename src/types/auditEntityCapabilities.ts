import type { AuditEntityType } from '@/src/types/enums';

export type AuditRevertHandlerType =
  'account' | 'journal' | 'budget' | 'planned_payment' | 'workplace' | 'none';
export type AuditStatusLookupType = Exclude<AuditRevertHandlerType, 'none'>;

export interface AuditEntityCapabilities {
  readonly canView: boolean;
  /** A handler name also identifies the entity-status query required before offering undo. */
  readonly revertHandler: AuditRevertHandlerType;
  /** Some entities are physically deleted and must be recreated to undo a delete. */
  readonly canRecreateAfterDelete?: boolean;
}

/** Every audit entity must make its view and undo behavior explicit. */
export const AUDIT_ENTITY_CAPABILITIES = {
  account: { canView: true, revertHandler: 'account' },
  journal: { canView: true, revertHandler: 'journal' },
  transaction: { canView: false, revertHandler: 'none' },
  exchange_rate: { canView: false, revertHandler: 'none' },
  budget: { canView: true, revertHandler: 'budget', canRecreateAfterDelete: true },
  planned_payment: { canView: true, revertHandler: 'planned_payment' },
  transaction_auto_post_rule: { canView: false, revertHandler: 'none' },
  transaction_inbox_record: { canView: false, revertHandler: 'none' },
  workplace: { canView: false, revertHandler: 'workplace' },
} satisfies Record<AuditEntityType, AuditEntityCapabilities>;

const UNSUPPORTED_AUDIT_ENTITY: AuditEntityCapabilities = {
  canView: false,
  revertHandler: 'none',
};

export function getAuditEntityCapabilities(entityType: string): AuditEntityCapabilities {
  if (!Object.prototype.hasOwnProperty.call(AUDIT_ENTITY_CAPABILITIES, entityType)) {
    return UNSUPPORTED_AUDIT_ENTITY;
  }
  return AUDIT_ENTITY_CAPABILITIES[entityType as AuditEntityType];
}
