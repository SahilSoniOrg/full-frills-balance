import { database } from '@/src/data/database/Database';
import AccountMatcher from '@/src/data/models/AccountMatcher';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AuditAction } from '@/src/types/enums';
import { Model, Q } from '@nozbe/watermelondb';
import type { AccountMatcherDefinitionV1 } from '@/src/types/accountMatcher';
import type { AuditEventType } from '@/src/types/auditEvents';

export interface AccountMatcherWriteInput {
  accountId: AccountId;
  definition: AccountMatcherDefinitionV1;
  conditionsKey: string;
  isEnabled: boolean;
  provenance: string;
}

function matcherAuditState(accountId: AccountId, isEnabled: boolean) {
  return { accountId, isEnabled };
}

function createdAtMs(matcher: AccountMatcher): number {
  return matcher.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

export class AccountMatcherConflictError extends Error {
  constructor(readonly existingMatcherId: string) {
    super('Another matcher already has these conditions');
    this.name = 'AccountMatcherConflictError';
  }
}

export class AccountMatcherProposalUnavailableError extends Error {
  constructor() {
    super('Account matcher evidence is no longer available');
    this.name = 'AccountMatcherProposalUnavailableError';
  }
}

interface MatcherState {
  record: AccountMatcher;
  accountId: AccountId;
  definitionJson: string;
  conditionsKey: string;
  isEnabled: boolean;
  provenance: string;
  createdAt: number;
}

function snapshot(record: AccountMatcher): MatcherState {
  return {
    record,
    accountId: record.accountId,
    definitionJson: record.definitionJson,
    conditionsKey: record.conditionsKey,
    isEnabled: record.isEnabled,
    provenance: record.provenance,
    createdAt: createdAtMs(record),
  };
}

/** Same collision policy for explicit moves and account merges: target identity, disabled wins. */
function coalesce(group: readonly MatcherState[], targetId: AccountId): MatcherState {
  const target = group.filter(item => item.record.accountId === targetId);
  const kept = [...(target.length ? target : group)].sort(
    (left, right) => left.createdAt - right.createdAt,
  )[0];
  return {
    ...kept,
    accountId: targetId,
    isEnabled: group.every(item => item.isEnabled),
    createdAt: Math.min(...group.map(item => item.createdAt)),
  };
}

export class AccountMatcherRepository {
  private get matchers() {
    return database.collections.get<AccountMatcher>('account_matchers');
  }

  async find(workplaceId: WorkplaceId, id: string): Promise<AccountMatcher | null> {
    const matches = await this.matchers
      .query(Q.where('id', id), Q.where('workplace_id', workplaceId))
      .fetch();
    return matches[0] ?? null;
  }

  async findForAccount(workplaceId: WorkplaceId, accountId: AccountId): Promise<AccountMatcher[]> {
    return this.matchers
      .query(Q.where('workplace_id', workplaceId), Q.where('account_id', accountId))
      .fetch();
  }

  observeForAccount(workplaceId: WorkplaceId, accountId: AccountId) {
    return this.matchers
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('account_id', accountId),
        Q.sortBy('created_at', Q.asc),
      )
      .observeWithColumns(['definition_json', 'conditions_key', 'is_enabled', 'account_id']);
  }

  async findEnabledByWorkplace(workplaceId: WorkplaceId): Promise<AccountMatcher[]> {
    return this.matchers
      .query(Q.where('workplace_id', workplaceId), Q.where('is_enabled', true))
      .fetch();
  }

  async findAllByAccountIds(
    workplaceId: WorkplaceId,
    accountIds: readonly AccountId[],
  ): Promise<AccountMatcher[]> {
    if (accountIds.length === 0) return [];
    return this.matchers
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('account_id', Q.oneOf([...new Set(accountIds)])),
      )
      .fetch();
  }

  async findByConditionsKey(
    workplaceId: WorkplaceId,
    accountId: AccountId,
    conditionsKey: string,
  ): Promise<AccountMatcher | null> {
    const matches = await this.matchers
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('account_id', accountId),
        Q.where('conditions_key', conditionsKey),
      )
      .fetch();
    return matches[0] ?? null;
  }

  prepareCreate(workplaceId: WorkplaceId, input: AccountMatcherWriteInput): AccountMatcher {
    const now = new Date();
    return this.matchers.prepareCreate(record => {
      record.workplaceId = workplaceId;
      record.accountId = input.accountId;
      record.definitionJson = JSON.stringify(input.definition);
      record.conditionsKey = input.conditionsKey;
      record.isEnabled = input.isEnabled;
      record.provenance = input.provenance;
      record._setRaw('created_at', now.getTime());
      record._setRaw('updated_at', now.getTime());
    });
  }

  private prepareChanges(
    workplaceId: WorkplaceId,
    records: readonly AccountMatcher[],
    next: readonly MatcherState[],
    source: 'app' | 'system' = 'app',
    correlationId?: string,
  ): Model[] {
    const byId = new Map(next.map(state => [state.record.id, state]));
    const operations: Model[] = [];
    for (const record of records) {
      const state = byId.get(record.id);
      const before = matcherAuditState(record.accountId, record.isEnabled);
      const after = state ? matcherAuditState(state.accountId, state.isEnabled) : undefined;
      const events: AuditEventType[] = [];
      if (!state) {
        operations.push(record.prepareDestroyPermanently());
        events.push('account_matcher.forgotten');
      } else {
        if (record.accountId !== state.accountId) events.push('account_matcher.moved');
        if (
          record.definitionJson !== state.definitionJson ||
          record.conditionsKey !== state.conditionsKey ||
          record.provenance !== state.provenance
        ) {
          events.push('account_matcher.updated');
        }
        if (record.isEnabled !== state.isEnabled) {
          events.push(state.isEnabled ? 'account_matcher.enabled' : 'account_matcher.disabled');
        }
        if (events.length || createdAtMs(record) !== state.createdAt) {
          operations.push(
            record.prepareUpdate(row => {
              row.accountId = state.accountId;
              row.definitionJson = state.definitionJson;
              row.conditionsKey = state.conditionsKey;
              row.isEnabled = state.isEnabled;
              row.provenance = state.provenance;
              row._setRaw('created_at', state.createdAt);
            }),
          );
        }
      }
      for (const eventType of events) {
        operations.push(
          auditRepository.prepareLog(
            {
              entityType: 'account_matcher',
              entityId: record.id,
              eventType,
              action: state ? AuditAction.UPDATE : AuditAction.DELETE,
              source,
              correlationId,
              changes: { before, ...(after ? { after } : {}) },
              undoable: false,
            },
            workplaceId,
          ),
        );
      }
    }
    return operations;
  }

  /**
   * Resolve the final matcher before staging writes. Preparing updates is deferred
   * until the session flush so a later error cannot leave live models mutated.
   */
  async saveInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    input: AccountMatcherWriteInput,
    existing: AccountMatcher | null,
    moving: AccountMatcher | null,
  ): Promise<AccountMatcher> {
    const targetRecords = await this.findForAccount(workplaceId, input.accountId);
    const records = [
      ...new Map(
        [...targetRecords, ...(moving ? [moving] : [])].map(record => [record.id, record]),
      ).values(),
    ];
    let next = records.map(snapshot);
    if (existing) {
      const duplicate = targetRecords.find(
        record => record.id !== existing.id && record.conditionsKey === input.conditionsKey,
      );
      if (duplicate) throw new AccountMatcherConflictError(duplicate.id);
      next = next.map(state =>
        state.record.id === existing.id
          ? { ...state, ...input, definitionJson: JSON.stringify(input.definition) }
          : state,
      );
    }
    if (moving && moving.id !== existing?.id) {
      next = next.map(state =>
        state.record.id === moving.id ? { ...state, accountId: input.accountId } : state,
      );
      const group = next.filter(state => state.conditionsKey === moving.conditionsKey);
      const kept = coalesce(group, input.accountId);
      next = [...next.filter(state => state.conditionsKey !== moving.conditionsKey), kept];
    }
    const saved = next.find(state => state.conditionsKey === input.conditionsKey);
    const matcher = saved?.record ?? this.prepareCreate(workplaceId, input);
    const created = saved ? null : matcher;

    stageModelWrite(session, () => {
      const operations = this.prepareChanges(workplaceId, records, next);
      if (created) {
        operations.push(
          created,
          auditRepository.prepareLog(
            {
              entityType: 'account_matcher',
              entityId: created.id,
              eventType: 'account_matcher.created',
              action: AuditAction.CREATE,
              source: 'app',
              changes: { after: matcherAuditState(input.accountId, input.isEnabled) },
              undoable: false,
            },
            workplaceId,
          ),
        );
      }
      return operations;
    });
    return matcher;
  }

  setEnabledInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    record: AccountMatcher,
    isEnabled: boolean,
  ): void {
    stageModelWrite(session, () =>
      this.prepareChanges(workplaceId, [record], [{ ...snapshot(record), isEnabled }]),
    );
  }

  forgetInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    record: AccountMatcher,
  ): void {
    stageModelWrite(session, () => this.prepareChanges(workplaceId, [record], []));
  }

  async mergeAccountsInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceIds: AccountId[],
    targetId: AccountId,
    correlationId?: string,
  ): Promise<void> {
    const records = await this.findAllByAccountIds(workplaceId, [...sourceIds, targetId]);
    stageModelWrite(session, () => {
      const grouped = new Map<string, MatcherState[]>();
      for (const record of records) {
        const group = grouped.get(record.conditionsKey) ?? [];
        group.push(snapshot(record));
        grouped.set(record.conditionsKey, group);
      }
      return this.prepareChanges(
        workplaceId,
        records,
        [...grouped.values()].map(group => coalesce(group, targetId)),
        'system',
        correlationId,
      );
    });
  }
}

export const accountMatcherRepository = new AccountMatcherRepository();
