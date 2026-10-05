import { database } from '@/src/data/database/Database';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import {
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import { observeQueryWithModelChanges } from '@/src/data/repositories/observeQueryWithModelChanges';
import { AccountId, EMPTY_ACCOUNT_ID, WorkplaceId } from '@/src/types/ids';
import { Model, Q } from '@nozbe/watermelondb';
import { Observable } from 'rxjs';
import {
  isMeaningfulSmsRuleCondition,
  SmsRuleActions,
  SmsRuleCondition,
  SmsRuleMode,
} from '@/src/utils/sms/RuleMatcher';
import { syncRuleActionsFromColumns } from '@/src/utils/sms/ruleActionsAccountIds';
import { AuditAction } from '@/src/types/enums';
import type { CanonicalTransactionAutoPostRule } from '@/src/types/importContracts';

export interface SmsRuleDraftInput {
  id?: string;
  mode: SmsRuleMode;
  senderMatch?: string;
  bodyMatch?: string;
  conditions?: SmsRuleCondition[];
  actions: SmsRuleActions;
  isActive: boolean;
  priority?: number;
}

export function autoPostRuleAuditSnapshot(
  rule: Omit<CanonicalTransactionAutoPostRule, 'id' | 'createdAt' | 'updatedAt'>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const fields = [
    'channelsJson',
    'senderMatch',
    'bodyMatch',
    'conditionsJson',
    'actionsJson',
    'priority',
    'sourceAccountId',
    'categoryAccountId',
    'isActive',
  ] as const;
  return Object.fromEntries(
    fields.map(field => [
      field,
      Object.prototype.hasOwnProperty.call(overrides, field)
        ? (overrides[field] ?? null)
        : (rule[field] ?? null),
    ]),
  );
}

export class TransactionAutoPostRuleRepository {
  private get rules() {
    return database.collections.get<TransactionAutoPostRule>('transaction_auto_post_rules');
  }

  async find(workplaceId: WorkplaceId, id: string): Promise<TransactionAutoPostRule | null> {
    const matches = await this.rules
      .query(Q.where('id', id), Q.where('workplace_id', workplaceId))
      .fetch();
    return matches[0] ?? null;
  }

  async findAllByWorkplace(workplaceId: WorkplaceId): Promise<TransactionAutoPostRule[]> {
    return await this.rules.query(Q.where('workplace_id', workplaceId)).fetch();
  }

  observeAllByWorkplace(workplaceId: WorkplaceId): Observable<TransactionAutoPostRule[]> {
    return observeQueryWithModelChanges(this.rules.query(Q.where('workplace_id', workplaceId)));
  }

  async findActiveByWorkplace(workplaceId: WorkplaceId): Promise<TransactionAutoPostRule[]> {
    return await this.rules
      .query(Q.where('is_active', true), Q.where('workplace_id', workplaceId))
      .fetch();
  }

  async delete(workplaceId: WorkplaceId, id: string): Promise<void> {
    await database.write(async () => {
      const rule = await this.find(workplaceId, id);
      if (!rule) throw new Error('SMS rule not found in workplace');
      await database.batch(
        rule.prepareDestroyPermanently(),
        auditRepository.prepareLog(
          {
            entityType: 'transaction_auto_post_rule',
            entityId: rule.id,
            eventType: 'transaction_auto_post_rule.deleted',
            action: AuditAction.DELETE,
            source: 'app',
            changes: { before: autoPostRuleAuditSnapshot(rule) },
            undoable: false,
          },
          workplaceId,
        ),
      );
    });
  }

  async save(data: SmsRuleDraftInput, workplaceId: WorkplaceId): Promise<TransactionAutoPostRule> {
    const normalizedConditions = (data.conditions || []).filter(isMeaningfulSmsRuleCondition);
    const sourceAccountId = data.actions.sourceAccountId || undefined;
    const categoryAccountId = data.actions.categoryAccountId || undefined;
    const actionsJson = syncRuleActionsFromColumns(
      JSON.stringify({
        disposition: data.actions.disposition,
        journalDescription: data.actions.journalDescription || undefined,
      }),
      { sourceAccountId, categoryAccountId },
    );
    const senderFallback =
      data.mode === 'regex'
        ? data.senderMatch || ''
        : normalizedConditions.find(condition => condition.field === 'sender')?.value ||
          'structured';
    const bodyFallback =
      data.mode === 'regex'
        ? data.bodyMatch || undefined
        : normalizedConditions.find(condition => condition.field === 'body')?.value;

    return await database.write(async () => {
      if (data.id) {
        const rule = await this.find(workplaceId, data.id);
        if (!rule) throw new Error('SMS rule not found in workplace');
        const before = autoPostRuleAuditSnapshot(rule);
        await rule.update(record => {
          record.channelsJson = JSON.stringify(['sms']);
          record.senderMatch = senderFallback;
          record.bodyMatch = bodyFallback;
          record.conditionsJson =
            data.mode === 'builder' ? JSON.stringify(normalizedConditions) : undefined;
          record.actionsJson = actionsJson;
          record.priority = data.priority ?? 100;
          record.sourceAccountId = sourceAccountId || EMPTY_ACCOUNT_ID;
          record.categoryAccountId = categoryAccountId || EMPTY_ACCOUNT_ID;
          record.isActive = data.isActive;
        });
        await database.batch(
          auditRepository.prepareLog(
            {
              entityType: 'transaction_auto_post_rule',
              entityId: rule.id,
              eventType: 'transaction_auto_post_rule.updated',
              action: AuditAction.UPDATE,
              source: 'app',
              changes: { before, after: autoPostRuleAuditSnapshot(rule) },
              undoable: false,
            },
            workplaceId,
          ),
        );
        return rule;
      } else {
        const rule = await this.rules.create(record => {
          record.workplaceId = workplaceId;
          record.channelsJson = JSON.stringify(['sms']);
          record.senderMatch = senderFallback;
          record.bodyMatch = bodyFallback;
          record.conditionsJson =
            data.mode === 'builder' ? JSON.stringify(normalizedConditions) : undefined;
          record.actionsJson = actionsJson;
          record.priority = data.priority ?? 100;
          record.sourceAccountId = sourceAccountId || EMPTY_ACCOUNT_ID;
          record.categoryAccountId = categoryAccountId || EMPTY_ACCOUNT_ID;
          record.isActive = data.isActive;
        });
        await database.batch(
          auditRepository.prepareLog(
            {
              entityType: 'transaction_auto_post_rule',
              entityId: rule.id,
              eventType: 'transaction_auto_post_rule.created',
              action: AuditAction.CREATE,
              source: 'app',
              changes: { after: autoPostRuleAuditSnapshot(rule) },
              undoable: false,
            },
            workplaceId,
          ),
        );
        return rule;
      }
    });
  }

  async findAllReferencingAccountIds(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<TransactionAutoPostRule[]> {
    if (accountIds.length === 0) return [];
    const [asSource, asCategory] = await Promise.all([
      this.rules
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('source_account_id', Q.oneOf(accountIds)),
        )
        .fetch(),
      this.rules
        .query(
          Q.where('workplace_id', workplaceId),
          Q.where('category_account_id', Q.oneOf(accountIds)),
        )
        .fetch(),
    ]);
    const byId = new Map<string, TransactionAutoPostRule>();
    for (const rule of [...asSource, ...asCategory]) {
      byId.set(rule.id, rule);
    }
    return Array.from(byId.values());
  }

  async mergeAccountsInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
    correlationId?: string,
  ): Promise<void> {
    const rules = await this.loadMergeRecords(workplaceId, sourceAccountIds);
    stageModelWrite(session, () =>
      this.prepareLoadedMergeOperations(rules, sourceAccountIds, targetAccountId, correlationId),
    );
  }

  private loadMergeRecords(workplaceId: WorkplaceId, sourceAccountIds: AccountId[]) {
    return this.findAllReferencingAccountIds(workplaceId, sourceAccountIds);
  }

  private prepareLoadedMergeOperations(
    rules: TransactionAutoPostRule[],
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
    correlationId?: string,
  ): Model[] {
    const sourceIds = new Set(sourceAccountIds);

    return rules.flatMap(record => {
      const source = sourceIds.has(record.sourceAccountId) ? targetAccountId : undefined;
      const category = sourceIds.has(record.categoryAccountId) ? targetAccountId : undefined;
      const nextSource = source ?? record.sourceAccountId;
      const nextCategory = category ?? record.categoryAccountId;
      const nextActions = syncRuleActionsFromColumns(record.actionsJson, {
        sourceAccountId: source ?? record.sourceAccountId,
        categoryAccountId: category ?? record.categoryAccountId,
      });
      const before = autoPostRuleAuditSnapshot(record);
      const after = autoPostRuleAuditSnapshot(record, {
        sourceAccountId: nextSource,
        categoryAccountId: nextCategory,
        actionsJson: nextActions,
      });
      return [
        record.prepareUpdate((r: TransactionAutoPostRule) => {
          if (source) r.sourceAccountId = source;
          if (category) r.categoryAccountId = category;
          r.actionsJson = nextActions;
        }),
        auditRepository.prepareLog(
          {
            entityType: 'transaction_auto_post_rule',
            entityId: record.id,
            eventType: 'transaction_auto_post_rule.accounts_retargeted',
            action: AuditAction.UPDATE,
            source: 'app',
            correlationId,
            changes: { before, after },
            undoable: false,
          },
          record.workplaceId,
        ),
      ];
    });
  }
}

export const transactionAutoPostRuleRepository = new TransactionAutoPostRuleRepository();
