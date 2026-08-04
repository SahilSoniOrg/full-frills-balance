import { AppSurface, AppText, ColoredDot } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { Box, Column, Row, Separator, Text } from '@/src/design-system';
import {
  SAFE_TO_SPEND_PREVIEW,
  SafeToSpendPreviewFixture,
} from '@/src/features/onboarding/fixtures/safeToSpendPreview';
import { useTheme } from '@/src/hooks/use-theme';
import { View } from 'react-native';

type OnboardingStsPreviewProps = {
  fixture?: SafeToSpendPreviewFixture;
};

/**
 * Self-contained Safe-to-Spend visual for onboarding theme selection.
 * Does not import dashboard SafeToSpendCard or simulation pipelines.
 */
export function OnboardingStsPreview({
  fixture = SAFE_TO_SPEND_PREVIEW,
}: OnboardingStsPreviewProps) {
  const { theme } = useTheme();
  const strings = AppConfig.strings.dashboard;
  const labels = strings.safeToSpendUi;
  const {
    safeToSpend,
    committedTotal,
    committedLiabilities,
    displaySafeToSpend,
    displayCommitted,
    displayDebts,
    isOverCommitted,
    isPositiveSafeToSpend,
    sparklineNorms,
  } = fixture;

  const effectiveTotal = committedTotal + committedLiabilities + Math.max(safeToSpend, 0);

  return (
    <AppSurface
      elevation="none"
      background="transparent"
      paddingHorizontal="none"
      paddingVertical="sm"
    >
      <Column gap="lg">
        <Column gap="xs">
          <Text
            variant="xs"
            weight="bold"
            color={isOverCommitted ? 'error' : 'secondary'}
            style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}
            numberOfLines={1}
          >
            {isOverCommitted ? strings.shortfall : strings.safeToSpendTitle}
          </Text>
          <Text
            variant="hero"
            color={isOverCommitted ? 'error' : isPositiveSafeToSpend ? 'success' : undefined}
            weight="bold"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
          >
            {displaySafeToSpend}
          </Text>
          <Text variant="xs" color={isOverCommitted ? 'error' : 'secondary'} opacity={0.8}>
            {isOverCommitted ? strings.shortfallSubtitle : strings.afterObligations}
          </Text>
        </Column>

        {effectiveTotal > 0 ? (
          <Column gap="md">
            <Box
              background="pureInverse"
              backgroundOpacity="active"
              height={10}
              borderRadius="full"
              flexDirection="row"
              overflow="hidden"
              marginBottom="md"
            >
              {committedTotal > 0 ? (
                <Box height="100%" flex={committedTotal} unsafe_backgroundRaw={theme.warning} />
              ) : null}
              {committedLiabilities > 0 ? (
                <Box height="100%" flex={committedLiabilities} unsafe_backgroundRaw={theme.error} />
              ) : null}
              {safeToSpend > 0 ? (
                <Box height="100%" flex={safeToSpend} unsafe_backgroundRaw={theme.primary} />
              ) : null}
            </Box>

            <Row gap="sm" wrap="wrap" justify="space-between">
              <Row align="center" gap="xs" style={{ flexShrink: 1 }}>
                <ColoredDot color={theme.primary} />
                <AppText variant="caption" color="secondary" numberOfLines={1}>
                  {labels.safePrefix}
                </AppText>
                <AppText variant="caption" weight="bold" color="primary" numberOfLines={1}>
                  {displaySafeToSpend}
                </AppText>
              </Row>
              <Row align="center" gap="xs" style={{ flexShrink: 1 }}>
                <ColoredDot color={theme.warning} />
                <AppText variant="caption" color="secondary" numberOfLines={1}>
                  {labels.committedPrefix}
                </AppText>
                <AppText variant="caption" weight="bold" color="warning" numberOfLines={1}>
                  {displayCommitted}
                </AppText>
              </Row>
              <Row align="center" gap="xs" style={{ flexShrink: 1 }}>
                <ColoredDot color={theme.error} />
                <AppText variant="caption" color="secondary" numberOfLines={1}>
                  {labels.debtsPrefix}
                </AppText>
                <AppText variant="caption" weight="bold" color="error" numberOfLines={1}>
                  {displayDebts}
                </AppText>
              </Row>
            </Row>
          </Column>
        ) : null}

        <Separator />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            height: 72,
            gap: Spacing.xs,
            paddingHorizontal: Spacing.xs,
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {sparklineNorms.map((norm, index) => (
            <View
              key={`spark-${index}`}
              style={{
                flex: 1,
                height: Math.max(4, Math.round(norm * 72)),
                borderRadius: 2,
                backgroundColor: theme.primary,
                opacity: 0.35 + norm * 0.45,
              }}
            />
          ))}
        </View>
      </Column>
    </AppSurface>
  );
}
