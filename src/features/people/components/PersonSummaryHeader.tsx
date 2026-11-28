import { AppText, Icon, IconButton, PersonAvatar, type IconName } from '@/src/components/core';
import { titleAmountFitHug } from '@/src/components/shared/FitText';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Size } from '@/src/constants/design-tokens';
import { Box, Inline, Stack } from '@/src/design-system';
import type { PersonBalanceSummary } from '@/src/domain/people/personTypes';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet } from 'react-native';
import { derivePersonHeroBalance } from '../helpers/derivePersonHeroBalance';
import { PersonBalanceBadge } from './PersonBalanceBadge';
import { PersonBalanceInline } from './PersonBalanceInline';
import { PersonMetaBadges } from './PersonMetaBadges';

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

export function PersonSummaryHeader({ person, summary, formatAmount, onSettle }: Props) {
  const { theme } = useTheme();
  const { settled, oneSided, multiCurrency, balanceLabel, heroAmount, heroCurrency, heroColor } =
    derivePersonHeroBalance(summary, person.name, person.defaultCurrencyCode);

  return (
    <Box paddingHorizontal="xs" testID="person-summary-header">
      <Inline gap="md" alignItems="center">
        <PersonAvatar
          name={person.name}
          icon={person.icon ?? undefined}
          color={person.color ?? undefined}
          size={Size.buttonLg}
        />
        <Stack gap="xs" flex={1} minWidth={0}>
          <Inline gap="sm" alignItems="center">
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
          </Inline>
          <PersonMetaBadges
            isPinned={person.isPinned}
            currency={person.defaultCurrencyCode}
            archived={Boolean(person.archivedAt)}
          />
        </Stack>
      </Inline>

      <Stack gap="xs" marginTop="md">
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
          <Inline gap="sm" alignItems="baseline" flexWrap="wrap">
            <MoneyText
              amount={Math.abs(heroAmount)}
              currencyCode={heroCurrency}
              variant="title"
              weight="semibold"
              color={heroColor}
              fit={titleAmountFitHug}
              testID="person-balance-amount"
            />
          </Inline>
        )}
        {!settled && (multiCurrency || !oneSided) ? (
          <PersonBalanceInline
            summary={summary}
            personName={person.name}
            formatAmount={formatAmount}
          />
        ) : null}
      </Stack>
    </Box>
  );
}

const styles = StyleSheet.create({
  name: {
    flex: 1,
    minWidth: 0,
  },
});
