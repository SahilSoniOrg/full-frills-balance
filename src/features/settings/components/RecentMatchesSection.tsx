import { AppCard, AppIcon, AppText, Badge } from '@/src/components/core';
import { FormSectionGroup } from '@/src/components/common/FormSectionGroup';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { formatDateKeepingPattern } from '@/src/utils/dateUtils';
import { SmsRuleFormViewModel } from '../hooks/useSmsRuleFormViewModel';
import { StyleSheet, View } from 'react-native';
import { withOpacity } from '@/src/utils/color-math';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useMemo } from 'react';
import { EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { Shape, Spacing, Typography, type Theme } from '@/src/constants';

function highlightSmsBody(
  text: string,
  mode: 'builder' | 'regex',
  builderQueries: string[],
  regexBodyPattern: string,
  theme: Theme,
) {
  if (!text)
    return (
      <AppText variant="caption" color="secondary">
        {text}
      </AppText>
    );

  let activeQueries: string[] = [];
  let regex: RegExp | null = null;

  if (mode === 'builder') {
    activeQueries = builderQueries.filter(q => q && q.trim().length > 0);
    if (activeQueries.length > 0) {
      const escaped = activeQueries.map(q => q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
      try {
        regex = new RegExp(`(${escaped.join('|')})`, 'gi');
      } catch {
        // Fallback
      }
    }
  } else if (regexBodyPattern.trim()) {
    try {
      regex = new RegExp(`(${regexBodyPattern.trim()})`, 'gi');
    } catch {
      // User is typing incomplete regex, ignore highlight
    }
  }

  if (!regex) {
    return (
      <AppText variant="caption" color="secondary">
        {text}
      </AppText>
    );
  }

  const parts = text.split(regex);
  return (
    <AppText variant="caption" color="secondary" style={styles.smsBodyText}>
      {parts.map((part, index) => {
        const isMatch = regex!.test(part);
        regex!.lastIndex = 0; // Reset state for subsequent matches

        return isMatch ? (
          <AppText
            key={index}
            variant="caption"
            weight="bold"
            style={[
              styles.highlightSpan,
              {
                backgroundColor: withOpacity(theme.primary, 0.25),
                color: theme.text,
              },
            ]}
          >
            {part}
          </AppText>
        ) : (
          part
        );
      })}
    </AppText>
  );
}

export function RecentMatchesSection({ vm }: { vm: SmsRuleFormViewModel }) {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const {
    mode,
    senderContains,
    bodyContains,
    merchantContains,
    accountSourceContains,
    legacyBodyMatch,
    disposition,
    sourceAccountId,
    categoryAccountId,
    accounts,
    previewMatches,
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

  if (previewMatches.length === 0) return null;

  return (
    <FormSectionGroup title="Recent Matches">
      {previewMatches.map(match => {
        const isCredit = match.direction === 'credit';
        const directionColor = isCredit ? theme.success : theme.error;

        return (
          <AppCard key={match.id} variant="outline" paddingSize="sm" style={styles.mockSmsCard}>
            {/* Chat Bubble Header */}
            <View style={styles.mockSmsHeader}>
              <View style={styles.mockSmsSenderInfo}>
                <View style={[styles.avatarCircle, { backgroundColor: theme.surfaceSecondary }]}>
                  <AppText variant="caption" weight="bold">
                    {(match.senderAddress || 'U')[0].toUpperCase()}
                  </AppText>
                </View>
                <View>
                  <AppText variant="caption" weight="bold">
                    {match.senderAddress || 'Unknown Origin'}
                  </AppText>
                  <AppText variant="caption" color="secondary" style={styles.smsTimestamp}>
                    {formatDateKeepingPattern(
                      match.inputDate,
                      'MMM D, YYYY',
                      resolvedHourCycle,
                      ' · ',
                    )}
                  </AppText>
                </View>
              </View>

              <Badge
                variant={isCredit ? 'success' : 'default'}
                size="sm"
                style={{ alignSelf: 'center' }}
              >
                {isCredit ? 'Incoming' : 'Outgoing'}
              </Badge>
            </View>

            {/* Chat Bubble Body */}
            <View style={[styles.smsBubbleContainer, { backgroundColor: theme.surfaceSecondary }]}>
              {highlightSmsBody(
                match.rawBody || '',
                mode,
                [senderContains, bodyContains, merchantContains, accountSourceContains],
                legacyBodyMatch,
                theme,
              )}
            </View>

            {/* Post-Ingestion Outcome Visualizer */}
            <View style={[styles.outcomeContainer, { borderTopColor: theme.border }]}>
              <View style={styles.outcomeHeader}>
                <AppText variant="caption" color="secondary" weight="semibold">
                  PREVIEW OUTCOME:
                </AppText>

                <AppText variant="body" weight="bold" style={{ color: directionColor }}>
                  {match.parsedAmount != null
                    ? `${isCredit ? '+' : '-'} ${CurrencyFormatter.format(
                        match.parsedAmount,
                        match.parsedCurrencyCode || 'INR',
                      )}`
                    : 'Amount Unresolved'}
                </AppText>
              </View>

              {disposition === 'ignore' ? (
                <View style={styles.dismissedBanner}>
                  <AppIcon name="closeCircle" size={14} color={theme.textSecondary} />
                  <AppText variant="caption" color="secondary" italic>
                    Silent dismissal. SMS will be discarded from inbox.
                  </AppText>
                </View>
              ) : (
                <View style={styles.ingestionBadgeRow}>
                  <View
                    style={[
                      styles.miniAccountBadge,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <AppIcon
                      name="creditCard"
                      size={10}
                      color={sourceAccount ? theme.primary : theme.textSecondary}
                    />
                    <AppText
                      variant="caption"
                      weight={sourceAccount ? 'semibold' : 'regular'}
                      style={[
                        styles.miniBadgeText,
                        { color: sourceAccount ? theme.text : theme.textSecondary },
                      ]}
                    >
                      {sourceAccount ? sourceAccount.name : 'Missing Source'}
                    </AppText>
                  </View>

                  <AppIcon name="arrowRight" size={10} color={theme.textSecondary} />

                  <View
                    style={[
                      styles.miniAccountBadge,
                      { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <AppIcon
                      name="tag"
                      size={10}
                      color={categoryAccount ? theme.primary : theme.textSecondary}
                    />
                    <AppText
                      variant="caption"
                      weight={categoryAccount ? 'semibold' : 'regular'}
                      style={[
                        styles.miniBadgeText,
                        { color: categoryAccount ? theme.text : theme.textSecondary },
                      ]}
                    >
                      {categoryAccount ? categoryAccount.name : 'Missing Category'}
                    </AppText>
                  </View>
                </View>
              )}
            </View>
          </AppCard>
        );
      })}
    </FormSectionGroup>
  );
}

const styles = StyleSheet.create({
  smsBodyText: {
    lineHeight: 18,
  },
  highlightSpan: {
    paddingHorizontal: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  mockSmsCard: {
    borderRadius: Shape.radius.r3,
    borderWidth: 1,
  },
  mockSmsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  mockSmsSenderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: Spacing.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smsTimestamp: {
    fontSize: Typography.sizes.xs - 2,
    marginTop: 2,
  },
  smsBubbleContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Shape.radius.r4,
    borderTopLeftRadius: Shape.radius.xs,
    marginBottom: Spacing.md,
  },
  outcomeContainer: {
    borderTopWidth: 1,
    paddingTop: Spacing.sm,
  },
  outcomeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  dismissedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: Shape.radius.xs,
  },
  ingestionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  miniAccountBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  miniBadgeText: {
    fontSize: Typography.sizes.xs - 1,
    flexShrink: 1,
  },
});
