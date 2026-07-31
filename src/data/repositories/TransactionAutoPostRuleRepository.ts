import { database } from '@/src/data/database/Database';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { AccountId, EMPTY_ACCOUNT_ID, WorkplaceId } from '@/src/types/domain';
import { Q } from '@nozbe/watermelondb';
import { Observable } from 'rxjs';
import { SmsRuleActions, SmsRuleCondition, SmsRuleMode } from '@/src/services/ledger/RuleMatcher';

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
      if (rule) await rule.destroyPermanently();
    });
  }

  async save(data: SmsRuleDraftInput, workplaceId: WorkplaceId): Promise<TransactionAutoPostRule> {
    const normalizedConditions = (data.conditions || []).filter(condition =>
      this.isMeaningfulCondition(condition),
    );
    const normalizedActions: SmsRuleActions = {
      disposition: data.actions.disposition,
      sourceAccountId: data.actions.sourceAccountId || undefined,
      categoryAccountId: data.actions.categoryAccountId || undefined,
      journalDescription: data.actions.journalDescription || undefined,
    };
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
          record.actionsJson = JSON.stringify(normalizedActions);
          record.priority = data.priority ?? 100;
          record.sourceAccountId = normalizedActions.sourceAccountId || EMPTY_ACCOUNT_ID;
          record.categoryAccountId = normalizedActions.categoryAccountId || EMPTY_ACCOUNT_ID;
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
          record.actionsJson = JSON.stringify(normalizedActions);
          record.priority = data.priority ?? 100;
          record.sourceAccountId = normalizedActions.sourceAccountId || EMPTY_ACCOUNT_ID;
          record.categoryAccountId = normalizedActions.categoryAccountId || EMPTY_ACCOUNT_ID;
          record.isActive = data.isActive;
        });
      }
    });
  }

  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<TransactionAutoPostRule[]> {
    const rulesSource = await this.rules
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('source_account_id', Q.oneOf(sourceAccountIds)),
      )
      .fetch();
    const rulesCategory = await this.rules
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('category_account_id', Q.oneOf(sourceAccountIds)),
      )
      .fetch();

    const mutations = new Map<
      string,
      { source?: AccountId; category?: AccountId; record: TransactionAutoPostRule }
    >();

    rulesSource.forEach(rule => {
      if (!mutations.has(rule.id)) {
        mutations.set(rule.id, { record: rule });
      }
      mutations.get(rule.id)!.source = targetAccountId;
    });

    rulesCategory.forEach(rule => {
      if (!mutations.has(rule.id)) {
        mutations.set(rule.id, { record: rule });
      }
      mutations.get(rule.id)!.category = targetAccountId;
    });

    return Array.from(mutations.values()).map(({ record, source, category }) => {
      return record.prepareUpdate((r: TransactionAutoPostRule) => {
        if (source) r.sourceAccountId = source;
        if (category) r.categoryAccountId = category;
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
