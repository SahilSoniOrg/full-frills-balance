import { database } from '@/src/data/database/Database';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { AccountId, EMPTY_ACCOUNT_ID, WorkplaceId } from '@/src/types/domain';
import { Q } from '@nozbe/watermelondb';
import { Observable } from 'rxjs';
import { SmsRuleActions, SmsRuleCondition, SmsRuleMode } from '@/src/utils/sms/RuleMatcher';
import { syncRuleActionsFromColumns } from '@/src/utils/sms/ruleActionsAccountIds';

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

export class TransactionAutoPostRuleRepository {
  private get rules() {
    return database.collections.get<TransactionAutoPostRule>('transaction_auto_post_rules');
  }

  async find(workplaceId: WorkplaceId, id: string): Promise<TransactionAutoPostRule | undefined> {
    try {
      const matches = await this.rules
        .query(Q.where('id', id), Q.where('workplace_id', workplaceId))
        .fetch();
      return matches[0];
    } catch {
      return undefined;
    }
  }

  async findAllByWorkplace(workplaceId: WorkplaceId): Promise<TransactionAutoPostRule[]> {
    return await this.rules.query(Q.where('workplace_id', workplaceId)).fetch();
  }

  observeAllByWorkplace(workplaceId: WorkplaceId): Observable<TransactionAutoPostRule[]> {
    return this.rules.query(Q.where('workplace_id', workplaceId)).observe();
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
      await rule.destroyPermanently();
    });
  }

  async save(data: SmsRuleDraftInput, workplaceId: WorkplaceId): Promise<TransactionAutoPostRule> {
    const normalizedConditions = (data.conditions || []).filter(condition =>
      this.isMeaningfulCondition(condition),
    );
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
        return rule;
      } else {
        return await this.rules.create(record => {
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

  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<TransactionAutoPostRule[]> {
    const sourceIds = new Set(sourceAccountIds);
    const rules = await this.findAllReferencingAccountIds(workplaceId, sourceAccountIds);

    return rules.map(record => {
      const source = sourceIds.has(record.sourceAccountId) ? targetAccountId : undefined;
      const category = sourceIds.has(record.categoryAccountId) ? targetAccountId : undefined;
      return record.prepareUpdate((r: TransactionAutoPostRule) => {
        if (source) r.sourceAccountId = source;
        if (category) r.categoryAccountId = category;
        r.actionsJson = syncRuleActionsFromColumns(r.actionsJson, {
          sourceAccountId: source ?? r.sourceAccountId,
          categoryAccountId: category ?? r.categoryAccountId,
        });
        r.updatedAt = new Date();
      });
    });
  }

  private isMeaningfulCondition(
    condition: Partial<SmsRuleCondition> | null | undefined,
  ): condition is SmsRuleCondition {
    if (!condition?.field || !condition.operator) return false;
    if (condition.field === 'amount') {
      if (condition.operator === 'between') {
        return typeof condition.minValue === 'number' && typeof condition.maxValue === 'number';
      }
      return typeof condition.minValue === 'number';
    }
    return !!condition.value?.trim();
  }
}

export const transactionAutoPostRuleRepository = new TransactionAutoPostRuleRepository();
