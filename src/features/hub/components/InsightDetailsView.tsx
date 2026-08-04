import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { MoneyText } from '@/src/components/common/MoneyText';
import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import type { InsightDetailsViewModel } from '@/src/features/hub/hooks/useInsightDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

export function InsightDetailsView({
  items,
  isLoading,
  header,
  title,
  emptyTitle,
  emptySubtitle,
}: InsightDetailsViewModel) {
  const { theme, fonts } = useTheme();

  const listHeader = (
    <View style={styles.headerContainer}>
      <View
        style={[
          styles.hero,
          {
            backgroundColor: withOpacity(header.severityColor, Opacity.soft),
            borderColor: header.severityColor,
          },
        ]}
      >
        <View
          style={[
            styles.severityChip,
            { backgroundColor: withOpacity(header.severityColor, Opacity.hover) },
          ]}
        >
          <AppIcon name="alert" size={12} color={header.severityColor} />
          <AppText variant="caption" weight="medium" style={{ color: header.severityColor }}>
            {header.severityLabel}
          </AppText>
        </View>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: withOpacity(header.severityColor, Opacity.hover) },
          ]}
        >
          <AppIcon name={header.iconName} size={Size.md} color={header.severityColor} />
        </View>
        <AppText variant="title" style={{ fontFamily: fonts.bold, marginTop: Spacing.md }}>
          {header.message}
        </AppText>
        {header.amount !== null ? (
          <View
            style={[
              styles.amountCard,
              { backgroundColor: withOpacity(header.severityColor, Opacity.hover) },
            ]}
          >
            <AppText variant="caption" weight="medium" style={{ color: header.severityColor }}>
              {header.impactLabel}
            </AppText>
            <MoneyText
              amount={header.amount}
              currencyCode={header.currencyCode}
              variant="title"
              style={{ color: header.severityColor, fontFamily: fonts.bold }}
            />
          </View>
        ) : null}
        {header.description ? (
          <AppText variant="body" color="secondary" style={styles.description}>
            {header.whyThisAppeared}
            {header.description}
          </AppText>
        ) : null}
        <View
          style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <View style={styles.actionHeader}>
            <AppIcon name="checkCircle" size={16} color={theme.textSecondary} />
            <AppText variant="caption" color="secondary" weight="semibold">
              {header.recommendedActionLabel}
            </AppText>
          </View>
          <AppText variant="body" color="secondary" style={styles.suggestion}>
            {header.suggestion}
          </AppText>
        </View>
        <AppText variant="caption" color="secondary" style={styles.basisText}>
          {header.basisText}
        </AppText>
      </View>
      <ScreenSectionHeader title={header.transactionsTitle} style={styles.listTitle} />
    </View>
  );

  return (
    <Screen title={title} withPadding={false} headerActions={<PrivacyToggleButton />}>
      <TransactionListView
        items={items}
        isLoading={isLoading}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        emptyTitle={emptyTitle}
        emptySubtitle={emptySubtitle}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    padding: Spacing.lg,
  },
  hero: {
    padding: Spacing.xl,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  severityChip: {
    alignSelf: 'center',
    borderRadius: Spacing.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs / 2,
    marginBottom: Spacing.sm,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  description: {
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  amountCard: {
    marginTop: Spacing.md,
    borderRadius: 12,
    width: '100%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  actionCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  suggestion: {
    lineHeight: 20,
  },
  basisText: {
    marginTop: Spacing.sm,
    opacity: Opacity.medium,
  },
  listTitle: {
    marginBottom: Spacing.md,
  },
  listContent: {
    paddingBottom: Spacing.xl * 2,
  },
});
