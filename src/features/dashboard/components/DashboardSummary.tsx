import { MoneyText } from '@/src/components/common/MoneyText';
import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { Opacity, Size, withOpacity } from '@/src/constants';
import { Box, Inline, Inset, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet } from 'react-native';

interface DashboardSummaryProps {
  income: number;
  expense: number;
  currencyCode: string;
}

export const DashboardSummary = ({ income, expense, currencyCode }: DashboardSummaryProps) => {
  const { theme, fonts } = useTheme();

  return (
    <Inline space="md" marginBottom="lg">
      {/* Income Column */}
      <AppCard elevation="sm" padding="none" style={styles.column}>
        <Inset space="md">
          <Stack gap="sm">
            <Inline align="center" space="xs">
              <Box
                width={Size.md}
                height={Size.md}
                borderRadius="full"
                alignItems="center"
                justifyContent="center"
                unsafe_backgroundRaw={withOpacity(theme.income, Opacity.soft)}
              >
                <AppIcon name="arrowDown" size={Size.xs} color={theme.income} />
              </Box>
              <AppText variant="caption" color="secondary">
                INCOME
              </AppText>
            </Inline>
            <MoneyText
              amount={income}
              currencyCode={currencyCode}
              formatStyle="compact"
              variant="subheading"
              style={{ color: theme.income, fontFamily: fonts.bold }}
            />
          </Stack>
        </Inset>
      </AppCard>

      {/* Expense Column */}
      <AppCard elevation="sm" padding="none" style={styles.column}>
        <Inset space="md">
          <Stack gap="sm">
            <Inline align="center" space="xs">
              <Box
                width={Size.md}
                height={Size.md}
                borderRadius="full"
                alignItems="center"
                justifyContent="center"
                unsafe_backgroundRaw={withOpacity(theme.expense, Opacity.soft)}
              >
                <AppIcon name="arrowUp" size={Size.xs} color={theme.expense} />
              </Box>
              <AppText variant="caption" color="secondary">
                EXPENSE
              </AppText>
            </Inline>
            <MoneyText
              amount={expense}
              currencyCode={currencyCode}
              formatStyle="compact"
              variant="subheading"
              style={{ color: theme.expense, fontFamily: fonts.bold }}
            />
          </Stack>
        </Inset>
      </AppCard>
    </Inline>
  );
};

const styles = StyleSheet.create({
  column: {
    flex: 1,
  },
});
