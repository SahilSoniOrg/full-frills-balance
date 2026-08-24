import { AppIcon, AppCard, AppText, Badge } from '@/src/components/core';
import { useTheme } from '@/src/hooks/use-theme';
import { SmsRuleFormViewModel } from '../hooks/useSmsRuleFormViewModel';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { withOpacity } from '@/src/utils/color-math';
import type { IconName } from '@/src/types/domainIcons';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { Shape, Spacing } from '@/src/constants';

export function RuleFlowPreview({ vm }: { vm: SmsRuleFormViewModel }) {
  const { theme } = useTheme();
  const {
    mode,
    senderContains,
    accountSourceContains,
    bodyContains,
    merchantContains,
    currencyCode,
    direction,
    amountOperator,
    amountValue,
    amountSecondaryValue,
    legacySenderMatch,
    legacyBodyMatch,
    disposition,
    sourceAccountId,
    categoryAccountId,
    isActive,
    accounts,
    showAccountMapping,
  } = vm;

  const sourceAccount = useMemo(() => {
    if (!showAccountMapping || sourceAccountId === EMPTY_ACCOUNT_ID) return null;
    return accounts.find(a => a.id === sourceAccountId) || null;
  }, [accounts, sourceAccountId, showAccountMapping]);

  const categoryAccount = useMemo(() => {
    if (!showAccountMapping || categoryAccountId === EMPTY_ACCOUNT_ID) return null;
    return accounts.find(a => a.id === categoryAccountId) || null;
  }, [accounts, categoryAccountId, showAccountMapping]);

  const activeConditions = useMemo(() => {
    const list: { label: string; icon: IconName; color: string }[] = [];
    if (mode === 'builder') {
      if (senderContains.trim()) {
        list.push({
          label: `Sender: ${senderContains.trim()}`,
          icon: 'mail',
          color: theme.primary,
        });
      }
      if (accountSourceContains.trim()) {
        list.push({
          label: `Source: ${accountSourceContains.trim()}`,
          icon: 'creditCard',
          color: theme.primary,
        });
      }
      if (bodyContains.trim()) {
        list.push({
          label: `Body: ${bodyContains.trim()}`,
          icon: 'messageSquare',
          color: theme.primary,
        });
      }
      if (merchantContains.trim()) {
        list.push({
          label: `Merchant: ${merchantContains.trim()}`,
          icon: 'tag',
          color: theme.primary,
        });
      }
      if (currencyCode.trim()) {
        list.push({
          label: `Currency: ${currencyCode.trim().toUpperCase()}`,
          icon: 'transaction',
          color: theme.primary,
        });
      }
      if (direction) {
        list.push({
          label: direction === 'debit' ? 'Debit Only' : 'Credit Only',
          icon: direction === 'debit' ? 'arrowUp' : 'arrowDown',
          color: direction === 'debit' ? theme.error : theme.success,
        });
      }
      if (amountOperator && amountValue.trim()) {
        const opLabel =
          amountOperator === 'eq'
            ? '='
            : amountOperator === 'gt'
              ? '>'
              : amountOperator === 'lt'
                ? '<'
                : 'between';
        const valText =
          amountOperator === 'between' ? `${amountValue} - ${amountSecondaryValue}` : amountValue;
        list.push({
          label: `Amount ${opLabel} ${valText}`,
          icon: 'calculator',
          color: theme.primary,
        });
      }
    } else {
      if (legacySenderMatch.trim()) {
        list.push({
          label: `Sender Regex: ${legacySenderMatch.trim()}`,
          icon: 'terminal',
          color: theme.warning,
        });
      }
      if (legacyBodyMatch.trim()) {
        list.push({
          label: `Body Regex: ${legacyBodyMatch.trim()}`,
          icon: 'terminal',
          color: theme.warning,
        });
      }
    }
    return list;
  }, [
    mode,
    senderContains,
    accountSourceContains,
    bodyContains,
    merchantContains,
    currencyCode,
    direction,
    amountOperator,
    amountValue,
    amountSecondaryValue,
    legacySenderMatch,
    legacyBodyMatch,
    theme,
  ]);

  const actionNode = useMemo(() => {
    switch (disposition) {
      case 'auto_post':
        return {
          label: 'Auto-Post',
          sub: 'Creates journal immediately',
          icon: 'zap' as const,
          color: theme.success,
          bg: withOpacity(theme.success, 0.1),
        };
      case 'ignore':
        return {
          label: 'Ignore Message',
          sub: 'Dismisses matching SMS',
          icon: 'closeCircle' as const,
          color: theme.textSecondary,
          bg: withOpacity(theme.textSecondary, 0.1),
        };
      case 'review':
      default:
        return {
          label: 'Require Review',
          sub: 'Leaves matches in Inbox',
          icon: 'eye' as const,
          color: theme.warning,
          bg: withOpacity(theme.warning, 0.1),
        };
    }
  }, [disposition, theme]);

  return (
    <AppCard paddingSize="md" variant="secondary" style={styles.flowCard}>
      <View style={styles.flowCardHeader}>
        <View style={styles.flowCardHeaderTitle}>
          <AppIcon name="activity" size={16} color={theme.primary} />
          <AppText variant="caption" weight="bold" color="secondary" style={{ letterSpacing: 1 }}>
            LIVE RULE FLOW PREVIEW
          </AppText>
        </View>
        <Badge variant={isActive ? 'success' : 'default'} size="sm">
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      </View>

      <View style={styles.flowContainer}>
        {/* Step 1: Conditions */}
        <View style={styles.flowStep}>
          <View style={styles.flowStepIndicator}>
            <View style={[styles.stepDot, { backgroundColor: theme.primary }]} />
            <View style={[styles.stepLine, { backgroundColor: theme.border }]} />
          </View>
          <View style={styles.flowStepContent}>
            <AppText variant="caption" color="secondary" weight="semibold" style={styles.stepTitle}>
              WHEN SMS ARRIVES MATCHING
            </AppText>
            {activeConditions.length > 0 ? (
              <View style={styles.chipGrid}>
                {activeConditions.map((cond, index) => (
                  <View
                    key={index}
                    style={[
                      styles.flowChip,
                      {
                        backgroundColor: withOpacity(cond.color, 0.08),
                        borderColor: withOpacity(cond.color, 0.15),
                      },
                    ]}
                  >
                    <AppIcon name={cond.icon} size={12} color={cond.color} />
                    <AppText variant="caption" weight="medium" style={{ color: cond.color }}>
                      {cond.label}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : (
              <View style={[styles.emptyDashedBox, { borderColor: theme.border }]}>
                <AppText variant="caption" color="secondary" italic>
                  Define search parameters below to see flow triggering
                </AppText>
              </View>
            )}
          </View>
        </View>

        {/* Step 2: Ingestion Action */}
        <View style={styles.flowStep}>
          <View style={styles.flowStepIndicator}>
            <View style={[styles.stepDot, { backgroundColor: actionNode.color }]} />
            {disposition !== 'ignore' ? (
              <View style={[styles.stepLine, { backgroundColor: theme.border }]} />
            ) : null}
          </View>
          <View style={styles.flowStepContent}>
            <AppText variant="caption" color="secondary" weight="semibold" style={styles.stepTitle}>
              THEN EXECUTE INGESTION ACTION
            </AppText>
            <View
              style={[
                styles.actionBadgeLarge,
                {
                  backgroundColor: actionNode.bg,
                  borderColor: withOpacity(actionNode.color, 0.2),
                },
              ]}
            >
              <AppIcon name={actionNode.icon} size={16} color={actionNode.color} />
              <View>
                <AppText variant="caption" weight="bold" style={{ color: theme.text }}>
                  {actionNode.label}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {actionNode.sub}
                </AppText>
              </View>
            </View>
          </View>
        </View>

        {/* Step 3: Ledger Outcome */}
        {disposition !== 'ignore' ? (
          <View style={styles.flowStepEnd}>
            <View style={styles.flowStepIndicator}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor:
                      sourceAccount && categoryAccount
                        ? theme.success
                        : disposition === 'auto_post'
                          ? theme.error
                          : theme.textSecondary,
                  },
                ]}
              />
            </View>
            <View style={styles.flowStepContent}>
              <AppText
                variant="caption"
                color="secondary"
                weight="semibold"
                style={styles.stepTitle}
              >
                MAP DOUBLE-ENTRY JOURNAL
              </AppText>
              <View style={styles.ledgerFlowContainer}>
                {/* Source Account card */}
                <View
                  style={[
                    styles.ledgerAccountBox,
                    sourceAccount
                      ? {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        }
                      : {
                          backgroundColor: 'transparent',
                          borderColor: disposition === 'auto_post' ? theme.error : theme.border,
                          borderStyle: 'dashed',
                        },
                  ]}
                >
                  <AppIcon
                    name="creditCard"
                    size={12}
                    color={sourceAccount ? theme.primary : theme.textSecondary}
                  />
                  <AppText
                    variant="caption"
                    weight={sourceAccount ? 'semibold' : 'regular'}
                    numberOfLines={1}
                    style={{
                      color: sourceAccount ? theme.text : theme.textSecondary,
                      flexShrink: 1,
                    }}
                  >
                    {sourceAccount ? sourceAccount.name : 'Select Source Account...'}
                  </AppText>
                </View>

                {/* Direction flow connector */}
                <View style={styles.ledgerFlowArrow}>
                  <AppIcon name="arrowRight" size={14} color={theme.textSecondary} />
                </View>

                {/* Category Account card */}
                <View
                  style={[
                    styles.ledgerAccountBox,
                    categoryAccount
                      ? {
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                        }
                      : {
                          backgroundColor: 'transparent',
                          borderColor: disposition === 'auto_post' ? theme.error : theme.border,
                          borderStyle: 'dashed',
                        },
                  ]}
                >
                  <AppIcon
                    name="tag"
                    size={12}
                    color={categoryAccount ? theme.primary : theme.textSecondary}
                  />
                  <AppText
                    variant="caption"
                    weight={categoryAccount ? 'semibold' : 'regular'}
                    numberOfLines={1}
                    style={{
                      color: categoryAccount ? theme.text : theme.textSecondary,
                      flexShrink: 1,
                    }}
                  >
                    {categoryAccount ? categoryAccount.name : 'Select Category...'}
                  </AppText>
                </View>
              </View>

              {disposition === 'auto_post' && (!sourceAccount || !categoryAccount) ? (
                <AppText variant="caption" color="error" style={styles.errorText}>
                  * Both accounts must be specified for Auto-Post rules
                </AppText>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  flowCard: {
    borderRadius: Shape.radius.r2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  flowCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  flowCardHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  flowContainer: {
    gap: Spacing.none,
  },
  flowStep: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  flowStepEnd: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  flowStepIndicator: {
    width: 16,
    alignItems: 'center',
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: Spacing.full,
    marginTop: 4,
    zIndex: 10,
  },
  stepLine: {
    width: 2,
    flex: 1,
    marginVertical: 2,
  },
  flowStepContent: {
    flex: 1,
    paddingBottom: Spacing.lg,
  },
  stepTitle: {
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  flowChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  emptyDashedBox: {
    padding: Spacing.sm,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: Spacing.xs,
  },
  actionBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  ledgerFlowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  ledgerAccountBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: Shape.radius.r4,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  ledgerFlowArrow: {
    width: 24,
    alignItems: 'center',
  },
  errorText: {
    marginTop: Spacing.sm,
  },
});
