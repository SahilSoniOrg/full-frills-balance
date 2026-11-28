import { AppText } from '@/src/components/core';
import { MetricHeroCard } from '@/src/components/shared/MetricHeroCard';
import { peopleStrings } from '@/src/constants/copy/domains/peopleStrings';
import { Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Box, Inline, Separator, Stack } from '@/src/design-system';
import { flowSignForAmount, signPrefix } from '@/src/domain/accounting/presentationPolicy';
import { useTheme } from '@/src/hooks/use-theme';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

type Props = {
  currencyCode: string;
  owedToYou: number;
  youOwe: number;
  children?: ReactNode;
};

export function PeopleBalanceOverview({ currencyCode, owedToYou, youOwe, children }: Props) {
  const { theme } = useTheme();
  const isPrivacyMode = useEffectivePrivacyMode();
  const net = owedToYou - youOwe;
  const total = owedToYou + youOwe;
  const showRatioBar = !isPrivacyMode && total > 0;

  return (
    <MetricHeroCard
      title={peopleStrings.netBalance(currencyCode)}
      amount={Math.abs(net)}
      currencyCode={currencyCode}
      prefix={signPrefix(flowSignForAmount(net))}
      amountStyle={styles.amount}
      middle={
        showRatioBar ? (
          <Inline
            height={Spacing.xs}
            borderRadius="full"
            overflow="hidden"
            marginBottom="lg"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {owedToYou > 0 ? (
              <Box width={`${(owedToYou / total) * 100}%`} background="income" />
            ) : null}
            {youOwe > 0 ? <Box flex={1} background="expense" /> : null}
          </Inline>
        ) : (
          <Separator background="divider" style={styles.separator} />
        )
      }
      left={{
        dotColor: theme.income,
        label: peopleStrings.owedToYou,
        amount: owedToYou,
        moneyColor: owedToYou > 0 ? 'income' : 'secondary',
      }}
      right={{
        dotColor: theme.expense,
        label: peopleStrings.youOwe,
        amount: youOwe,
        moneyColor: youOwe > 0 ? 'expense' : 'secondary',
      }}
      footer={
        children ? (
          <Stack gap="sm" marginTop="md">
            <Separator background="divider" />
            {children}
          </Stack>
        ) : null
      }
    />
  );
}

export function PeopleBalanceOverviewSecondary({ entries }: { entries: readonly string[] }) {
  if (entries.length === 0) return null;
  return (
    <Stack gap="xs">
      <AppText variant="overline" color="secondary">
        {peopleStrings.otherCurrencies}
      </AppText>
      {entries.map(entry => (
        <AppText key={entry} variant="bodySmall" color="secondary" tabular>
          {entry}
        </AppText>
      ))}
    </Stack>
  );
}

const styles = StyleSheet.create({
  amount: {
    marginBottom: Spacing.sm,
  },
  separator: {
    marginBottom: Spacing.lg,
  },
});
