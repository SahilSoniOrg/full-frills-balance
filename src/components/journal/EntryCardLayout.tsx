import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppText } from '@/src/components/core';
import { Size, Spacing, Typography } from '@/src/constants';
import { Box, Stack } from '@/src/design-system';
import type { MoneyFormatStyle } from '@/src/utils/currencyFormatter';
import type { ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

/**
 * Shared body of entry-style list cards (journal entries, planned payments):
 * leading tile, title, headline amount, then a footer row.
 */
export function EntryCardLayout({
  leading,
  title,
  titleAccessory,
  subtitle,
  amount,
  currencyCode,
  amountPrefix,
  amountFormatStyle = 'trimmed',
  amountColor,
  amountCaption,
  badge,
  footer,
  overlay,
}: {
  leading: ReactNode;
  title: string;
  titleAccessory?: ReactNode;
  subtitle?: string;
  amount: number;
  currencyCode: string;
  amountPrefix?: string;
  amountFormatStyle?: MoneyFormatStyle;
  amountColor: string;
  amountCaption?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  /** Absolutely positioned over the header's trailing edge; the header reserves room for it. */
  overlay?: ReactNode;
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <Box paddingHorizontal="md" paddingVertical="lg">
      <Stack gap="md">
        <View style={[styles.header, overlay != null ? styles.overlayHeader : undefined]}>
          <View style={[styles.identity, fontScale > 1 ? styles.enlargedIdentity : undefined]}>
            {leading}
            <Stack gap="xs" style={styles.headerContent}>
              <View style={styles.titleLine}>
                <AppText
                  variant="body"
                  weight="bold"
                  numberOfLines={2}
                  testID="journal-entry-card-title"
                  style={styles.shrink}
                >
                  {title}
                </AppText>
                {titleAccessory}
              </View>
              {subtitle ? (
                <AppText
                  variant="caption"
                  color="secondary"
                  numberOfLines={2}
                  style={styles.shrink}
                >
                  {subtitle}
                </AppText>
              ) : null}
            </Stack>
          </View>
          <Stack gap="xs" align="flex-end" style={styles.amountColumn}>
            <MoneyText
              amount={amount}
              currencyCode={currencyCode}
              formatStyle={amountFormatStyle}
              prefix={amountPrefix}
              variant="xl"
              weight="bold"
              tabular
              align="right"
              fit={{
                maxFontSize: Typography.roles.xl.fontSize,
                minFontSize: Math.round(Typography.roles.xl.fontSize * 0.65),
                lineHeightRatio: Typography.roles.xl.lineHeight / Typography.roles.xl.fontSize,
                hug: true,
              }}
              style={{ color: amountColor, minHeight: Math.ceil(Size.lg * fontScale) }}
            />
            {amountCaption}
          </Stack>
        </View>
        {badge}
        {footer}
      </Stack>
      {overlay}
    </Box>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: Spacing.md },
  overlayHeader: { paddingRight: Size.md + Spacing.sm },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexGrow: 1,
    flexBasis: '50%',
    minWidth: 0,
  },
  enlargedIdentity: { flexBasis: '100%' },
  headerContent: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minWidth: 0 },
  amountColumn: { flexShrink: 1, maxWidth: '100%', marginLeft: 'auto' },
  shrink: { flexShrink: 1, minWidth: 0 },
});
