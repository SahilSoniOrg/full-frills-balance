import { AppText } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig, ChromeMotion, Typography } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Box, Page, SetupProgressBar, Stack, usePageKeyboard } from '@/src/design-system';
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
                <SetupProgressBar label={stage.label} current={stage.current} total={stage.total} />
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

/** Keeps the estimate prominent, then collapses it while the keyboard is open. */
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
  const note = spokenEcho ?? change ?? (isIncompleteEstimate ? copy.estimateIncomplete : undefined);
  const amountColor = !hasUsableEstimate
    ? 'secondary'
    : amount > 0
      ? 'primary'
      : amount < 0
        ? 'error'
        : 'secondary';
  const amountText = (variant: 'subheading' | 'hero') => (
    <MoneyText
      amount={hasUsableEstimate ? amount : 0}
      currencyCode={currency}
      formatStyle="sts"
      variant={variant}
      color={amountColor}
      fit={variant === 'hero' ? STS_HERO_FIT : STS_COMPACT_FIT}
      testID="onboarding-sts"
    />
  );

  return (
    <>
      {compact ? (
        <Box paddingVertical="sm">
          <Stack direction="row" align="center" justify="space-between" gap="md">
            <AppText variant="caption" color="secondary" weight="medium">
              {copy.safeToSpend}
            </AppText>
            <Box flex={1} minWidth={0} alignItems="flex-end">
              {amountText('subheading')}
            </Box>
          </Stack>
        </Box>
      ) : (
        <Stack gap="xs" paddingTop="sm" paddingBottom="md">
          <AppText variant="caption" color="secondary" weight="medium">
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
      <Box height={Typography.roles.caption.lineHeight} justifyContent="center">
        {note ? (
          <AppText
            variant="caption"
            color="secondary"
            numberOfLines={1}
            testID={
              spokenEcho
                ? 'onboarding-sts-echo'
                : change
                  ? 'onboarding-sts-change'
                  : 'onboarding-sts-note'
            }
          >
            {note}
          </AppText>
        ) : null}
      </Box>
    </>
  );
}

const progressTotal = ONBOARDING_PROGRESS_FLOW.length;

export function onboardingStepLabel(step: OnboardingStep): string {
  return (
    ONBOARDING_PROGRESS_FLOW.find(entry => entry.step === step)?.progressName ?? copy.progressDevice
  );
}

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
