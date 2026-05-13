import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { Opacity, Spacing, withOpacity } from '@/src/constants';
import SmsAutoPostRule from '@/src/data/models/SmsAutoPostRule';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface SmsRuleCardViewProps {
  item: SmsAutoPostRule;
  accountMap: Map<string, string>;
  onPress: (item: SmsAutoPostRule) => void;
}

export function getConditions(rule: SmsAutoPostRule): any[] {
  if (!rule.conditionsJson) return [];
  try {
    const parsed = JSON.parse(rule.conditionsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getActionLabel(rule: SmsAutoPostRule) {
  if (!rule.actionsJson) return 'Auto-post';
  try {
    const parsed = JSON.parse(rule.actionsJson);
    if (parsed?.disposition === 'ignore') return 'Ignore';
    if (parsed?.disposition === 'review') return 'Review';
  } catch {
    // fallback below
  }
  return 'Auto-post';
}

export function getConditionSummary(rule: SmsAutoPostRule) {
  const conditions = getConditions(rule);
  if (conditions.length === 0) {
    return rule.bodyMatch
      ? `Regex: ${rule.senderMatch} / ${rule.bodyMatch}`
      : `Regex: ${rule.senderMatch}`;
  }

  return conditions
    .map(condition => {
      switch (condition.field) {
        case 'sender':
          return `Sender contains "${condition.value}"`;
        case 'body':
          return `Body contains "${condition.value}"`;
        case 'merchant':
          return `Merchant contains "${condition.value}"`;
        case 'account_source':
          return `Source contains "${condition.value}"`;
        case 'direction':
          return `Direction is ${condition.value}`;
        case 'currency':
          return `Currency is ${condition.value}`;
        case 'amount':
          if (condition.operator === 'between') {
            return `Amount between ${condition.minValue} and ${condition.maxValue}`;
          }
          return `Amount ${condition.operator} ${condition.minValue}`;
        default:
          return null;
      }
    })
    .filter(Boolean)
    .join(' • ');
}

export function SmsRuleCardView({ item, accountMap, onPress }: SmsRuleCardViewProps) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity activeOpacity={Opacity.heavy} onPress={() => onPress(item)}>
      <AppCard elevation="sm" style={styles.card}>
        <View style={styles.cardHeader}>
          <AppText variant="subheading" weight="semibold">
            {getConditions(item).length > 0 ? 'Structured rule' : item.senderMatch}
          </AppText>
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: item.isActive
                  ? withOpacity(theme.success, Opacity.soft)
                  : withOpacity(theme.textSecondary, Opacity.soft),
              },
            ]}
          >
            <AppText
              variant="caption"
              style={{ color: item.isActive ? theme.success : theme.textSecondary }}
            >
              {item.isActive ? 'Active' : 'Inactive'}
            </AppText>
          </View>
        </View>
        <AppText variant="body" color="secondary" style={styles.bodyMatch}>
          {getConditionSummary(item)}
        </AppText>
        <AppText variant="caption" color="secondary">
          Action: {getActionLabel(item)} | Priority: {item.priority ?? 100}
        </AppText>
        {getActionLabel(item) === 'Auto-post' &&
        (!!item.sourceAccountId || !!item.categoryAccountId) ? (
          <View style={styles.accountsRow}>
            <AppText variant="caption" color="secondary">
              {accountMap.get(item.sourceAccountId) || item.sourceAccountId}
            </AppText>
            <AppIcon
              name="arrowRight"
              size={14}
              color={theme.textSecondary}
              style={{ marginHorizontal: Spacing.xs }}
            />
            <AppText variant="caption" color="secondary">
              {accountMap.get(item.categoryAccountId) || item.categoryAccountId}
            </AppText>
          </View>
        ) : null}
      </AppCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
  },
  bodyMatch: {
    marginBottom: Spacing.sm,
  },
  accountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
});
