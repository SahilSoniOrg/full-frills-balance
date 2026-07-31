import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Size, withOpacity } from '@/src/constants';
import { Box, Inline, Inset, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { StyleSheet } from 'react-native';

interface DashboardSummaryProps {
  income: number;
  expense: number;
  currencyCode: string;
  /** Screen/VM privacy flag — do not read privacy hooks in this leaf. */
  isPrivacyMode?: boolean;
}

export const DashboardSummary = ({
  income,
  expense,
  currencyCode,
  isPrivacyMode = false,
}: DashboardSummaryProps) => {
  const { theme, fonts } = useTheme();

  const formatValue = (val: number) => {
    if (isPrivacyMode) return AppConfig.privacyMask;
    return CurrencyFormatter.format(val, currencyCode, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

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
            <AppText variant="subheading" style={{ color: theme.income, fontFamily: fonts.bold }}>
              {formatValue(income)}
            </AppText>
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
            <AppText variant="subheading" style={{ color: theme.expense, fontFamily: fonts.bold }}>
              {formatValue(expense)}
            </AppText>
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
