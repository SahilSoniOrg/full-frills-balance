import { getActionLabel, getConditionSummary, getConditions } from '../SmsRuleCardView';
import type { PlainSmsRule } from '@/src/types/plainDtos';

const baseRule = {
  id: 'rule-1',
  senderMatch: 'BANK',
  bodyMatch: 'payment',
  sourceAccountId: 'source',
  categoryAccountId: 'category',
  isActive: true,
} as PlainSmsRule;

describe('SmsRuleCardView presentation helpers', () => {
  it('formats structured conditions', () => {
    const rule = {
      ...baseRule,
      conditionsJson: JSON.stringify([
        { field: 'merchant', value: 'Cafe' },
        { field: 'direction', value: 'debit' },
      ]),
    } as PlainSmsRule;

    expect(getConditions(rule)).toEqual([
      { field: 'merchant', value: 'Cafe' },
      { field: 'direction', value: 'debit' },
    ]);
    expect(getConditionSummary(rule)).toBe('Merchant contains "Cafe" • Direction is debit');
  });

  it('preserves legacy rule summaries and action dispositions', () => {
    expect(getConditionSummary(baseRule)).toBe('Regex: BANK / payment');
    expect(getActionLabel({ ...baseRule, actionsJson: '{"disposition":"ignore"}' })).toBe('Ignore');
    expect(getActionLabel({ ...baseRule, actionsJson: '{"disposition":"review"}' })).toBe('Review');
  });

  it('uses safe fallbacks for malformed payloads', () => {
    const rule = {
      ...baseRule,
      conditionsJson: '{bad',
      actionsJson: '{bad',
    };

    expect(getConditions(rule)).toEqual([]);
    expect(getActionLabel(rule)).toBe('Auto-post');
    expect(getConditionSummary(rule)).toBe('Regex: BANK / payment');
  });
});
