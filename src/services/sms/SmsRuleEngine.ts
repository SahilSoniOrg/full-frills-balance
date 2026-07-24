import { database } from '@/src/data/database/Database';
import { AccountType } from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import TransactionInboxRecord, {
  InboxProcessingStatus,
} from '@/src/data/models/TransactionInboxRecord';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import {
  SmsRuleDraftInput,
  transactionAutoPostRuleRepository,
} from '@/src/data/repositories/TransactionAutoPostRuleRepository';
import { ParsedTransaction, toTransactionDirection } from '@/src/services/ledger/SmsParser';
import {
  ResolvedSmsRule,
  RuleMatcher,
  SmsMatchData,
  SmsRuleActions,
  SmsRuleCondition,
  SmsRuleMode,
} from '@/src/services/ledger/RuleMatcher';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/domain';
import { safeParseJSON } from '@/src/utils/serialization';
import { Q } from '@nozbe/watermelondb';

export interface SmsRuleSuggestion {
  senderMatch: string;
  bodyMatch?: string;
  sourceAccountId: AccountId;
  categoryAccountId: AccountId;
  sourceAccountName: string;
  categoryAccountName: string;
  sampleCount: number;
  sampleMerchants: string[];
}

export interface SmsRulePreviewInput {
  mode: SmsRuleMode;
  senderMatch?: string;
  bodyMatch?: string;
  conditions?: SmsRuleCondition[];
}

export class SmsRuleEngine {
  private get inbox() {
    return database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
  }

  isMeaningfulCondition(
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

  getRulePriority(rule: TransactionAutoPostRule): number {
    return typeof rule.priority === 'number' ? rule.priority : 100;
  }

  getRuleDefinition(rule: TransactionAutoPostRule): ResolvedSmsRule {
    let conditions: SmsRuleCondition[] = [];
    let actions: SmsRuleActions = {
      disposition: 'auto_post',
      sourceAccountId: rule.sourceAccountId || undefined,
      categoryAccountId: rule.categoryAccountId || undefined,
    };
    let mode: SmsRuleMode = 'regex';

    if (rule.conditionsJson) {
      const parsed = safeParseJSON<any[]>(rule.conditionsJson, []);
      if (Array.isArray(parsed)) {
        conditions = parsed.filter(condition => this.isMeaningfulCondition(condition));
        if (conditions.length > 0) {
          mode = 'builder';
        }
      }
    }

    if (rule.actionsJson) {
      const parsed = safeParseJSON<any>(rule.actionsJson, {});
      if (parsed && typeof parsed === 'object') {
        actions = {
          disposition:
            parsed.disposition === 'ignore' || parsed.disposition === 'review'
              ? parsed.disposition
              : 'auto_post',
          sourceAccountId: parsed.sourceAccountId || actions.sourceAccountId,
          categoryAccountId: parsed.categoryAccountId || actions.categoryAccountId,
        };
      }
    }

    return {
      mode,
      senderMatch: rule.senderMatch || undefined,
      bodyMatch: rule.bodyMatch || undefined,
      conditions,
      actions,
      priority: this.getRulePriority(rule),
    };
  }

  matchesResolvedRule(data: SmsMatchData, definition: ResolvedSmsRule): boolean {
    return RuleMatcher.compileRule(definition)(data);
  }

  matchesPreviewRule(data: TransactionInboxRecord, input: SmsRulePreviewInput): boolean {
    const parsedRule: ResolvedSmsRule = {
      mode: input.mode,
      senderMatch: input.senderMatch,
      bodyMatch: input.bodyMatch,
      conditions: (input.conditions || []).filter(condition =>
        this.isMeaningfulCondition(condition),
      ),
      actions: { disposition: 'review' },
      priority: 100,
    };
    const matchData: SmsMatchData = {
      senderAddress: data.senderAddress || '',
      rawBody: data.rawBody || '',
      parsedMerchant: data.parsedMerchant || undefined,
      parsedAccountSource: data.parsedAccountSource || undefined,
      direction: data.direction,
      parsedCurrencyCode: data.parsedCurrencyCode || undefined,
      parsedAmount: data.parsedAmount || undefined,
    };
    return RuleMatcher.compileRule(parsedRule)(matchData);
  }

  async previewRuleMatches(
    inputOrSender: SmsRulePreviewInput | string,
    bodyMatch?: string,
  ): Promise<TransactionInboxRecord[]> {
    const previewInput: SmsRulePreviewInput =
      typeof inputOrSender === 'string'
        ? { mode: 'regex', senderMatch: inputOrSender, bodyMatch }
        : inputOrSender;

    const items = await this.inbox
      .query(Q.where('channel', 'sms'), Q.sortBy('input_date', Q.desc), Q.take(50))
      .fetch();
    return items.filter(item => this.matchesPreviewRule(item, previewInput)).slice(0, 5);
  }

  async getMatchingRule(
    address: string,
    body: string,
    parsed: ParsedTransaction,
    workplaceId: WorkplaceId,
  ): Promise<TransactionAutoPostRule | null> {
    const activeRules = (
      await transactionAutoPostRuleRepository.findActiveByWorkplace(workplaceId)
    ).sort((a, b) => this.getRulePriority(b) - this.getRulePriority(a));

    const matchData: SmsMatchData = {
      senderAddress: address,
      rawBody: body,
      parsedMerchant: parsed.merchant,
      parsedAccountSource: parsed.accountSource,
      direction: toTransactionDirection(parsed.type),
      parsedCurrencyCode: parsed.currencyCode,
      parsedAmount: parsed.amount,
    };

    for (const rule of activeRules) {
      const definition = this.getRuleDefinition(rule);
      if (this.matchesResolvedRule(matchData, definition)) {
        return rule;
      }
    }

    return null;
  }

  async getRuleSuggestions(workplaceId: WorkplaceId): Promise<SmsRuleSuggestion[]> {
    const existingRules = await transactionAutoPostRuleRepository.findAllByWorkplace(workplaceId);
    const records = await this.inbox
      .query(
        Q.where('channel', 'sms'),
        Q.where('linked_journal_id', Q.notEq(null)),
        Q.where(
          'processing_status',
          Q.oneOf([InboxProcessingStatus.IMPORTED, InboxProcessingStatus.AUTO_POSTED]),
        ),
        Q.sortBy('input_date', Q.desc),
        Q.take(200),
      )
      .fetch();

    const grouped = new Map<
      string,
      {
        senderAddress: string;
        merchant?: string;
        accountSource?: string;
        journalIds: JournalId[];
        count: number;
      }
    >();

    for (const record of records) {
      if (!record.senderAddress) continue;
      const key = `${record.senderAddress.toUpperCase()}::${(record.parsedMerchant || '').toUpperCase()}`;
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
        if (record.linkedJournalId) current.journalIds.push(record.linkedJournalId);
      } else {
        grouped.set(key, {
          senderAddress: record.senderAddress,
          merchant: record.parsedMerchant || undefined,
          accountSource: record.parsedAccountSource || undefined,
          journalIds: record.linkedJournalId ? [record.linkedJournalId] : [],
          count: 1,
        });
      }
    }

    const suggestions: SmsRuleSuggestion[] = [];
    for (const group of grouped.values()) {
      if (group.count < 2 || group.journalIds.length < 2) continue;
      const suggestion = await this.buildSuggestionFromHistory(group, workplaceId);
      if (!suggestion) continue;

      const alreadyExists = existingRules.some(
        rule =>
          rule.senderMatch === suggestion.senderMatch &&
          (rule.bodyMatch || '') === (suggestion.bodyMatch || '') &&
          rule.sourceAccountId === suggestion.sourceAccountId &&
          rule.categoryAccountId === suggestion.categoryAccountId,
      );
      if (!alreadyExists) {
        suggestions.push(suggestion);
      }
    }

    return suggestions.sort((a, b) => b.sampleCount - a.sampleCount).slice(0, 5);
  }

  private async buildSuggestionFromHistory(
    group: {
      senderAddress: string;
      merchant?: string;
      accountSource?: string;
      journalIds: JournalId[];
      count: number;
    },
    workplaceId: WorkplaceId,
  ): Promise<SmsRuleSuggestion | null> {
    const journals = await journalRepository.findByIds(workplaceId, group.journalIds.slice(0, 10));
    const accountIds = new Set<AccountId>();
    const journalTransactions = new Map<JournalId, Transaction[]>();

    for (const journal of journals) {
      const transactions = await database.collections
        .get<Transaction>('transactions')
        .query(Q.where('journal_id', journal.id), Q.where('deleted_at', Q.eq(null)))
        .fetch();
      journalTransactions.set(journal.id, transactions);
      transactions.forEach((tx: Transaction) => accountIds.add(tx.accountId));
    }

    const accounts = await accountRepository.findAllByIds(workplaceId, Array.from(accountIds));
    const accountMap = new Map(accounts.map(account => [account.id, account]));
    const sourceCounts = new Map<AccountId, number>();
    const categoryCounts = new Map<AccountId, number>();

    for (const journal of journals) {
      const transactions = journalTransactions.get(journal.id) || [];
      for (const tx of transactions) {
        const account = accountMap.get(tx.accountId);
        if (!account) continue;
        if (
          [AccountType.ASSET, AccountType.LIABILITY].includes(account.accountType as AccountType)
        ) {
          sourceCounts.set(
            account.id as AccountId,
            (sourceCounts.get(account.id as AccountId) || 0) + 1,
          );
        } else if (
          [AccountType.EXPENSE, AccountType.INCOME].includes(account.accountType as AccountType)
        ) {
          categoryCounts.set(
            account.id as AccountId,
            (categoryCounts.get(account.id as AccountId) || 0) + 1,
          );
        }
      }
    }

    const sourceAccountId = Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    const categoryAccountId = Array.from(categoryCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0];
    if (!sourceAccountId || !categoryAccountId) return null;

    const sourceAccount = accountMap.get(sourceAccountId);
    const categoryAccount = accountMap.get(categoryAccountId);
    if (!sourceAccount || !categoryAccount) return null;

    return {
      senderMatch: group.senderAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      bodyMatch: group.merchant
        ? group.merchant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : group.accountSource,
      sourceAccountId,
      categoryAccountId,
      sourceAccountName: sourceAccount.name,
      categoryAccountName: categoryAccount.name,
      sampleCount: group.count,
      sampleMerchants: group.merchant ? [group.merchant] : [],
    };
  }

  async saveAutoPostRule(data: SmsRuleDraftInput, workplaceId: WorkplaceId) {
    await transactionAutoPostRuleRepository.save(data, workplaceId);
  }

  async deleteAutoPostRule(id: string) {
    await transactionAutoPostRuleRepository.delete(id);
  }

  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<TransactionAutoPostRule[]> {
    return transactionAutoPostRuleRepository.prepareMergeOperations(
      workplaceId,
      sourceAccountIds,
      targetAccountId,
    );
  }
}

export const smsRuleEngine = new SmsRuleEngine();
