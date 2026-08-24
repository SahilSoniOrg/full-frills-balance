import {
  SmsRuleActions,
  SmsRuleCondition,
  SmsRuleDisposition,
  SmsRuleMode,
} from '@/src/utils/sms/RuleMatcher';
import { SmsRulePreviewInput } from '@/src/services/sms/SmsRuleEngine';
import { AccountId } from '@/src/types/ids';
import { PlainSmsRule } from '@/src/types/plainDtos';

export type SmsRuleAmountOperator = '' | 'eq' | 'gt' | 'lt' | 'between';
export type SmsRuleDirection = '' | 'debit' | 'credit';

export interface SmsRuleBuilderFieldState {
  senderContains: string;
  bodyContains: string;
  merchantContains: string;
  accountSourceContains: string;
  direction: SmsRuleDirection;
  currencyCode: string;
  amountOperator: SmsRuleAmountOperator;
  amountValue: string;
  amountSecondaryValue: string;
}

export interface SmsRuleFormHydration {
  mode: SmsRuleMode;
  legacySenderMatch: string;
  legacyBodyMatch: string;
  disposition: SmsRuleDisposition;
  sourceAccountId?: AccountId;
  categoryAccountId?: AccountId;
  journalDescription: string;
  priority: string;
  isActive: boolean;
  builderFields: SmsRuleBuilderFieldState;
}

export interface SmsRuleValidationInput {
  mode: SmsRuleMode;
  legacySenderMatch: string;
  legacyBodyMatch: string;
  structuredConditions: SmsRuleCondition[];
  amountOperator: SmsRuleAmountOperator;
  amountValue: string;
  amountSecondaryValue: string;
  priority: string;
  disposition: SmsRuleDisposition;
  sourceAccountId: AccountId;
  categoryAccountId: AccountId;
  emptyAccountId: AccountId;
}

type ConditionField = SmsRuleCondition['field'];

export function parseSmsRuleConditions(rule: PlainSmsRule): SmsRuleCondition[] {
  if (!rule.conditionsJson) return [];
  try {
    const parsed = JSON.parse(rule.conditionsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseSmsRuleActions(rule: PlainSmsRule): SmsRuleActions {
  if (rule.actionsJson) {
    try {
      const parsed = JSON.parse(rule.actionsJson);
      if (parsed && typeof parsed === 'object') {
        return {
          disposition:
            parsed.disposition === 'ignore' || parsed.disposition === 'review'
              ? parsed.disposition
              : 'auto_post',
          sourceAccountId: parsed.sourceAccountId || rule.sourceAccountId || undefined,
          categoryAccountId: parsed.categoryAccountId || rule.categoryAccountId || undefined,
          journalDescription: parsed.journalDescription || undefined,
        };
      }
    } catch {
      // fallback below
    }
  }

  return {
    disposition: 'auto_post',
    sourceAccountId: rule.sourceAccountId || undefined,
    categoryAccountId: rule.categoryAccountId || undefined,
  };
}

export function hydrateSmsRuleForm(rule: PlainSmsRule): SmsRuleFormHydration {
  const conditions = parseSmsRuleConditions(rule);
  const actions = parseSmsRuleActions(rule);
  const amountCondition = getSmsRuleConditionValue(conditions, 'amount');
  const directionValue = getSmsRuleConditionValue(conditions, 'direction')?.value;
  const amountOperator = amountCondition?.operator;

  return {
    mode: conditions.length > 0 ? 'builder' : 'regex',
    legacySenderMatch: rule.senderMatch || '',
    legacyBodyMatch: rule.bodyMatch || '',
    disposition: actions.disposition,
    sourceAccountId: actions.sourceAccountId,
    categoryAccountId: actions.categoryAccountId,
    journalDescription: actions.journalDescription || '',
    priority: String(rule.priority ?? 100),
    isActive: rule.isActive,
    builderFields: {
      senderContains: getSmsRuleConditionValue(conditions, 'sender')?.value || '',
      bodyContains: getSmsRuleConditionValue(conditions, 'body')?.value || '',
      merchantContains: getSmsRuleConditionValue(conditions, 'merchant')?.value || '',
      accountSourceContains: getSmsRuleConditionValue(conditions, 'account_source')?.value || '',
      direction: directionValue === 'debit' || directionValue === 'credit' ? directionValue : '',
      currencyCode: getSmsRuleConditionValue(conditions, 'currency')?.value || '',
      amountOperator:
        amountOperator === 'eq' ||
        amountOperator === 'gt' ||
        amountOperator === 'lt' ||
        amountOperator === 'between'
          ? amountOperator
          : '',
      amountValue: amountCondition?.minValue !== undefined ? String(amountCondition.minValue) : '',
      amountSecondaryValue:
        amountCondition?.maxValue !== undefined ? String(amountCondition.maxValue) : '',
    },
  };
}

export function getSmsRuleConditionValue(
  conditions: SmsRuleCondition[],
  field: ConditionField,
): SmsRuleCondition | undefined {
  return conditions.find(condition => condition.field === field);
}

export function buildStructuredSmsRuleConditions(
  fields: SmsRuleBuilderFieldState,
): SmsRuleCondition[] {
  const amountNumber = fields.amountValue.trim() ? Number(fields.amountValue.trim()) : undefined;
  const amountSecondNumber = fields.amountSecondaryValue.trim()
    ? Number(fields.amountSecondaryValue.trim())
    : undefined;

  const conditions: SmsRuleCondition[] = [];
  if (fields.senderContains.trim()) {
    conditions.push({
      field: 'sender',
      operator: 'contains',
      value: fields.senderContains.trim(),
    });
  }
  if (fields.bodyContains.trim()) {
    conditions.push({
      field: 'body',
      operator: 'contains',
      value: fields.bodyContains.trim(),
    });
  }
  if (fields.merchantContains.trim()) {
    conditions.push({
      field: 'merchant',
      operator: 'contains',
      value: fields.merchantContains.trim(),
    });
  }
  if (fields.accountSourceContains.trim()) {
    conditions.push({
      field: 'account_source',
      operator: 'contains',
      value: fields.accountSourceContains.trim(),
    });
  }
  if (fields.direction) {
    conditions.push({ field: 'direction', operator: 'is', value: fields.direction });
  }
  if (fields.currencyCode.trim()) {
    conditions.push({
      field: 'currency',
      operator: 'is',
      value: fields.currencyCode.trim().toUpperCase(),
    });
  }
  if (
    amountOperatorIsSet(fields.amountOperator) &&
    amountNumber !== undefined &&
    !Number.isNaN(amountNumber)
  ) {
    conditions.push({
      field: 'amount',
      operator: fields.amountOperator,
      minValue: amountNumber,
      maxValue:
        fields.amountOperator === 'between' &&
        amountSecondNumber !== undefined &&
        !Number.isNaN(amountSecondNumber)
          ? amountSecondNumber
          : undefined,
    });
  }

  return conditions;
}

function amountOperatorIsSet(op: SmsRuleAmountOperator): op is Exclude<SmsRuleAmountOperator, ''> {
  return op !== '';
}

export function validateSmsRuleRegexPatterns(senderMatch: string, bodyMatch?: string): boolean {
  try {
    new RegExp(senderMatch.trim(), 'i');
    if (bodyMatch?.trim()) new RegExp(bodyMatch.trim(), 'i');
    return true;
  } catch {
    return false;
  }
}

export function isSmsRuleFormValid(input: SmsRuleValidationInput): boolean {
  const hasBuilderConditions = input.structuredConditions.length > 0;
  const hasRegexConditions = input.legacySenderMatch.trim().length > 0;
  const priorityNumber = input.priority.trim() ? Number(input.priority.trim()) : 100;
  const priorityIsValid = Number.isFinite(priorityNumber) && priorityNumber >= 0;
  const amountIsValid = input.amountOperator
    ? input.amountValue.trim().length > 0 &&
      (input.amountOperator !== 'between' || input.amountSecondaryValue.trim().length > 0)
    : true;
  const accountsAreValid =
    input.disposition === 'auto_post'
      ? input.sourceAccountId !== input.emptyAccountId &&
        input.categoryAccountId !== input.emptyAccountId
      : true;

  return (
    (input.mode === 'builder' ? hasBuilderConditions : hasRegexConditions) &&
    amountIsValid &&
    priorityIsValid &&
    accountsAreValid
  );
}

export function buildSmsRulePreviewInput(
  mode: SmsRuleMode,
  structuredConditions: SmsRuleCondition[],
  legacySenderMatch: string,
  legacyBodyMatch: string,
): SmsRulePreviewInput {
  return mode === 'builder'
    ? { mode, conditions: structuredConditions }
    : {
        mode,
        senderMatch: legacySenderMatch.trim(),
        bodyMatch: legacyBodyMatch.trim() || undefined,
      };
}

export function smsRulePreviewHasConditions(
  mode: SmsRuleMode,
  structuredConditions: SmsRuleCondition[],
  legacySenderMatch: string,
): boolean {
  return mode === 'builder' ? structuredConditions.length > 0 : legacySenderMatch.trim().length > 0;
}

export function shouldShowSmsRuleAccountMapping(disposition: SmsRuleDisposition): boolean {
  return disposition === 'auto_post' || disposition === 'review';
}
