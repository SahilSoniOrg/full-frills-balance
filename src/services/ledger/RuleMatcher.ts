import { TransactionDirection } from '@/src/data/models/TransactionInboxRecord';
import { AccountId } from '@/src/types/domain';
import { AppConfig } from '@/src/constants/app-config';

export interface SmsMatchData {
  senderAddress: string;
  rawBody: string;
  parsedMerchant?: string;
  parsedAccountSource?: string;
  direction: TransactionDirection;
  parsedCurrencyCode?: string;
  parsedAmount?: number;
}

export type SmsRuleMode = 'builder' | 'regex';
export type SmsRuleDisposition = 'auto_post' | 'review' | 'ignore';
export type SmsRuleField =
  | 'sender'
  | 'body'
  | 'merchant'
  | 'account_source'
  | 'direction'
  | 'currency'
  | 'amount';
export type SmsRuleStringOperator = 'contains' | 'is';
export type SmsRuleAmountOperator = 'eq' | 'gt' | 'lt' | 'between';

export interface SmsRuleCondition {
  field: SmsRuleField;
  operator: SmsRuleStringOperator | SmsRuleAmountOperator | 'is';
  value?: string;
  minValue?: number;
  maxValue?: number;
}

export interface SmsRuleActions {
  disposition: SmsRuleDisposition;
  sourceAccountId?: AccountId;
  categoryAccountId?: AccountId;
  journalDescription?: string;
}

export type ResolvedSmsRule = {
  mode: SmsRuleMode;
  senderMatch?: string;
  bodyMatch?: string;
  conditions: SmsRuleCondition[];
  actions: SmsRuleActions;
  priority: number;
};

export type Predicate = (data: SmsMatchData) => boolean;

export class RuleMatcher {
  private static buildRegex(pattern?: string): RegExp | null {
    if (!pattern?.trim()) return null;
    try {
      return new RegExp(pattern, 'i');
    } catch {
      return null;
    }
  }

  private static matchesStringCondition(
    source: string | undefined,
    operator: SmsRuleStringOperator,
    value?: string,
  ): boolean {
    if (!source || !value) return false;
    const left = source.toLowerCase();
    const right = value.toLowerCase();
    return operator === 'is' ? left === right : left.includes(right);
  }

  private static matchesAmountCondition(
    amount: number | undefined,
    condition: SmsRuleCondition,
  ): boolean {
    if (typeof amount !== 'number') return false;
    const operator = condition.operator as SmsRuleAmountOperator;
    const minValue = typeof condition.minValue === 'number' ? condition.minValue : undefined;
    const maxValue = typeof condition.maxValue === 'number' ? condition.maxValue : undefined;
    const exactValue = typeof condition.minValue === 'number' ? condition.minValue : undefined;

    switch (operator) {
      case 'eq':
        return exactValue !== undefined ? Math.abs(amount - exactValue) < 0.0001 : false;
      case 'gt':
        return minValue !== undefined ? amount > minValue : false;
      case 'lt':
        return minValue !== undefined ? amount < minValue : false;
      case 'between':
        return minValue !== undefined && maxValue !== undefined
          ? amount >= Math.min(minValue, maxValue) && amount <= Math.max(minValue, maxValue)
          : false;
      default:
        return false;
    }
  }

  private static matchesCondition(data: SmsMatchData, condition: SmsRuleCondition): boolean {
    const normalizedValue = condition.value?.trim();

    switch (condition.field) {
      case 'sender':
        return this.matchesStringCondition(
          data.senderAddress,
          condition.operator as SmsRuleStringOperator,
          normalizedValue,
        );
      case 'body':
        return this.matchesStringCondition(
          data.rawBody,
          condition.operator as SmsRuleStringOperator,
          normalizedValue,
        );
      case 'merchant':
        return this.matchesStringCondition(
          data.parsedMerchant,
          condition.operator as SmsRuleStringOperator,
          normalizedValue,
        );
      case 'account_source':
        return this.matchesStringCondition(
          data.parsedAccountSource,
          condition.operator as SmsRuleStringOperator,
          normalizedValue,
        );
      case 'direction':
        return this.matchesStringCondition(data.direction, 'is', normalizedValue);
      case 'currency':
        return this.matchesStringCondition(data.parsedCurrencyCode, 'is', normalizedValue);
      case 'amount':
        return this.matchesAmountCondition(data.parsedAmount, condition);
      default:
        return false;
    }
  }

  static compileCondition(condition: SmsRuleCondition): Predicate {
    return (data: SmsMatchData) => this.matchesCondition(data, condition);
  }

  static compileRule(rule: ResolvedSmsRule): Predicate {
    if (rule.mode === 'builder' && rule.conditions.length > 0) {
      const conditionPredicates = rule.conditions.map(c => this.compileCondition(c));
      return (data: SmsMatchData) => conditionPredicates.every(predicate => predicate(data));
    }

    const senderRegex = this.buildRegex(rule.senderMatch);
    const bodyRegex = rule.bodyMatch ? this.buildRegex(rule.bodyMatch) : null;

    return (data: SmsMatchData) => {
      const senderOk = senderRegex?.test(
        data.senderAddress.substring(0, AppConfig.input.sms.maxSenderMatchLength),
      );
      const bodyOk = bodyRegex
        ? bodyRegex.test(data.rawBody.substring(0, AppConfig.input.sms.maxBodyMatchLength))
        : true;
      return !!senderOk && bodyOk;
    };
  }
}
