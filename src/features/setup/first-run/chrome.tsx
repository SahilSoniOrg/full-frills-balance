import { AppText } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig, ChromeMotion, Typography } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Box, Inline, Page, SetupProgressBar, Stack, usePageKeyboard } from '@/src/design-system';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { MotiView } from 'moti';
import type { ReactNode } from 'react';
import type { OnboardingStep } from './draft';
import { ONBOARDING_PROGRESS_FLOW } from './flow';

export type OnboardingStage = {
  readonly label: string;
  readonly current: number;
  readonly total: number;
};

export function OnboardingChrome({
  stage,
  header,
  testID,
  children,
}: {
  readonly stage: OnboardingStage | null;
  readonly header?: ReactNode;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  return (
    <Page testID={testID} edges={['top', 'bottom']} keyboardAvoiding>
      <Box flex={1} minHeight={0}>
        <Box paddingHorizontal="lg" paddingTop={0} paddingBottom="sm" flex={1}>
          <Box
            maxWidth={AppConfig.layout.maxContentWidth}
            width="100%"
            style={{ alignSelf: 'center' }}
            flex={1}
            minHeight={0}
          >
            {stage ? (
              <Box paddingTop="lg" paddingBottom="sm">
                <SetupProgressBar
                  label={stage.label}
                  current={stage.current}
                  total={stage.total}
                />
              </Box>
            ) : null}
            {header ? <Box flexShrink={0}>{header}</Box> : null}
            <Box flex={1} minHeight={0} overflow="hidden">
              {children}
            </Box>
          </Box>
        </Box>
      </Box>
    </Page>
  );
}

// Same floors as the old minimumFontScale (0.6 hero, 0.7 compact), now honoured on web too.
const STS_HERO_FIT = {
  maxFontSize: Typography.roles.hero.fontSize,
  minFontSize: Math.round(Typography.roles.hero.fontSize * 0.6),
  lineHeightRatio: Typography.lineHeights.tight,
};
const STS_COMPACT_FIT = {
  maxFontSize: Typography.roles.subheading.fontSize,
  minFontSize: Math.round(Typography.roles.subheading.fontSize * 0.7),
  lineHeightRatio: Typography.roles.subheading.lineHeight / Typography.roles.subheading.fontSize,
  hug: true,
};

/** Collapses to a single row while the keyboard is open so the focused field keeps its room. */
export function SafeToSpendHeader({
  amount,
  currency,
  change,
  spokenEcho,
  hasUsableEstimate = true,
  isIncompleteEstimate = false,
}: {
  readonly amount: number;
  readonly currency: string;
  readonly change?: string | null;
  readonly spokenEcho?: string | null;
  readonly hasUsableEstimate?: boolean;
  readonly isIncompleteEstimate?: boolean;
}) {
  const { isKeyboardVisible: compact } = usePageKeyboard();
  const reduceMotion = useReducedMotion();

  const amountText = (variant: 'subheading' | 'hero') => (
    hasUsableEstimate ? (
    <MoneyText
      amount={amount}
      currencyCode={currency}
      formatStyle="sts"
      variant={variant}
      fit={variant === 'hero' ? STS_HERO_FIT : STS_COMPACT_FIT}
      testID="onboarding-sts"
    />
    ) : <AppText variant={variant} testID="onboarding-estimate-unavailable">{copy.clarityUnknown}</AppText>
  );

  return (
    <>
      {compact ? (
        <Box paddingVertical="sm">
          <Stack direction="row" align="center" justify="space-between" gap="md">
            <AppText variant="caption" color="secondary" weight="medium">
              {copy.safeToSpend}
            </AppText>
            {amountText('subheading')}
          </Stack>
        </Box>
      ) : (
        <Stack gap="xs" paddingTop="sm" paddingBottom="md">
          <AppText variant="body" color="secondary" weight="medium">
            {copy.safeToSpend}
          </AppText>
          {reduceMotion ? (
            amountText('hero')
          ) : (
            <MotiView
              from={{ opacity: 0, scale: ChromeMotion.panelFromScale }}
              animate={{ opacity: 1, scale: 1 }}
              transition={ChromeMotion.sheetSpring}
            >
              {amountText('hero')}
            </MotiView>
          )}
        </Stack>
      )}
      {isIncompleteEstimate ? (
        <AppText variant="caption" color="secondary">{copy.estimateIncomplete}</AppText>
      ) : null}
      {spokenEcho ? (
        <Box paddingBottom="xs">
          <AppText
            variant="caption"
            color="secondary"
            testID="onboarding-sts-echo"
          >
            {spokenEcho}
          </AppText>
        </Box>
      ) : null}
      {change ? (
        <Box paddingBottom="sm">
          <AppText
            variant="caption"
            color="secondary"
            testID="onboarding-sts-change"
          >
            {change}
          </AppText>
        </Box>
      ) : null}
    </>
  );
}

const progressTotal = ONBOARDING_PROGRESS_FLOW.length;

export function onboardingStage(step: OnboardingStep): OnboardingStage | null {
  const index = ONBOARDING_PROGRESS_FLOW.findIndex(entry => entry.step === step);
  if (index < 0) return null;
  const current = index + 1;
  return {
    label: copy.stageProgress(current, progressTotal, ONBOARDING_PROGRESS_FLOW[index].progressName),
    current,
    total: progressTotal,
  };
}
