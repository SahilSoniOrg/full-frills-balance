import {
  AppText,
  Badge,
  Icon,
  IconButton,
  PersonAvatar,
  type IconName,
} from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Spacing, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import type { PersonBalanceSummary } from '@/src/domain/people/personTypes';
import { StyleSheet, View } from 'react-native';
import { PersonBalanceBadge } from './PersonBalanceBadge';

const TITLE_BALANCE_FIT = {
  maxFontSize: Typography.roles.title.fontSize,
  minFontSize: Math.round(Typography.roles.title.fontSize * 0.6),
  lineHeightRatio: Typography.roles.title.lineHeight / Typography.roles.title.fontSize,
  hug: true,
};

type PersonLike = {
  name: string;
  icon?: IconName | null;
  color?: string | null;
  isPinned?: boolean;
  archivedAt?: Date | string | null;
  defaultCurrencyCode?: string | null;
};

type Props = {
  person: PersonLike;
  summary: PersonBalanceSummary;
  formatAmount: (amount: number, currencyCode: string) => string;
  onSettle?: () => void;
};

function primaryBalance(summary: PersonBalanceSummary) {
  const active = summary.currencies.filter(
    balance => balance.owedToYou !== 0 || balance.youOwe !== 0 || balance.net !== 0,
  );
  if (active.length === 1) return active[0]!;
  if (active.length === 0 && summary.convertedNet) {
    return {
      currencyCode: summary.convertedNet.currencyCode,
      owedToYou: 0,
      youOwe: 0,
      net: summary.convertedNet.amount,
    };
  }
  return null;
}

export function PersonSummaryHeader({ person, summary, formatAmount, onSettle }: Props) {
  const { theme } = useTheme();
  const primary = primaryBalance(summary);
  const settled =
    !primary || (primary.owedToYou === 0 && primary.youOwe === 0 && primary.net === 0);
  const oneSided =
    primary != null &&
    ((primary.owedToYou !== 0 && primary.youOwe === 0) ||
      (primary.youOwe !== 0 && primary.owedToYou === 0));
  const multiCurrency =
    summary.currencies.filter(b => b.owedToYou !== 0 || b.youOwe !== 0 || b.net !== 0).length > 1;

  const balanceLabel = settled
    ? 'Balance'
    : oneSided && primary!.owedToYou !== 0
      ? `${person.name} owes you`
      : oneSided && primary!.youOwe !== 0
        ? `You owe ${person.name}`
        : 'Net';

  const heroAmount = settled ? 0 : oneSided ? primary!.owedToYou || primary!.youOwe : primary!.net;
  const heroCurrency =
    primary?.currencyCode ??
    summary.convertedNet?.currencyCode ??
    person.defaultCurrencyCode ??
    'INR';
  const heroColor = settled
    ? 'income'
    : oneSided
      ? primary!.owedToYou !== 0
        ? 'income'
        : 'expense'
      : heroAmount >= 0
        ? 'income'
        : 'expense';

  return (
    <View style={styles.card} testID="person-summary-header">
      <View style={styles.header}>
        <PersonAvatar
          name={person.name}
          icon={person.icon ?? undefined}
          color={person.color ?? undefined}
          size={52}
        />
        <View style={styles.titleInfo}>
          <View style={styles.nameRow}>
            <AppText variant="title" fontRole="display" numberOfLines={2} style={styles.name}>
              {person.name}
            </AppText>
            {!settled && onSettle ? (
              <IconButton
                name={Icon.CheckCircle}
                variant="surface"
                iconColor={theme.text}
                onPress={onSettle}
                accessibilityLabel={`Settle with ${person.name}`}
                testID="person-settle-up-button"
              />
            ) : null}
          </View>
          <View style={styles.metaRow}>
            {person.isPinned ? (
              <Badge size="sm" variant="primary" icon={Icon.Star}>
                Pinned
              </Badge>
            ) : null}
            {person.defaultCurrencyCode ? (
              <Badge size="sm">{person.defaultCurrencyCode}</Badge>
            ) : null}
            {person.archivedAt ? <Badge size="sm">Archived</Badge> : null}
          </View>
        </View>
      </View>

      <View style={styles.balanceBlock}>
        <AppText variant="caption" color="secondary">
          {balanceLabel}
        </AppText>
        {settled ? (
          <PersonBalanceBadge
            summary={summary}
            personName={person.name}
            formatAmount={formatAmount}
          />
        ) : (
          <View style={styles.amountLine}>
            <MoneyText
              amount={Math.abs(heroAmount)}
              currencyCode={heroCurrency}
              variant="title"
              weight="semibold"
              color={heroColor}
              fit={TITLE_BALANCE_FIT}
              testID="person-balance-amount"
            />
          </View>
        )}
        {!settled && (multiCurrency || !oneSided) ? (
          <PersonBalanceBadge
            summary={summary}
            personName={person.name}
            compact
            formatAmount={formatAmount}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  titleInfo: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  balanceBlock: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  amountLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: Spacing.sm,
  },
});
