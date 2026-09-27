import { AppText } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig, ChromeMotion, Spacing } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Box, Inline, Inset, Page, Stack, usePageKeyboard } from '@/src/design-system';
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
  const reduceMotion = useReducedMotion();
  const progressRatio = stage ? stage.current / stage.total : 0;

  return (
    <Page testID={testID} edges={['top', 'bottom']} keyboardAvoiding>
      <Box flex={1} minHeight={0}>
        <Inset horizontal="lg" top={0} bottom="sm" flex={1}>
          <Box
            maxWidth={AppConfig.layout.maxContentWidth}
            width="100%"
            style={{ alignSelf: 'center' }}
            flex={1}
            minHeight={0}
          >
            {stage ? (
              <Box paddingTop="lg" paddingBottom="sm" accessibilityLabel={stage.label}>
                <Inline align="center" justify="space-between" marginBottom="sm">
                  <AppText variant="body" color="secondary" weight="medium">
                    {stage.label}
                  </AppText>
                </Inline>
                <Box height={Spacing.xs} borderRadius="full" background="border" overflow="hidden">
                  {reduceMotion ? (
                    <Box
                      height="100%"
                      width={`${progressRatio * 100}%`}
                      borderRadius="full"
                      background="primary"
                    />
                  ) : (
                    <MotiView
                      animate={{ width: `${progressRatio * 100}%` }}
                      transition={ChromeMotion.panel}
                      style={{ height: '100%', borderRadius: 999, overflow: 'hidden' }}
                    >
                      <Box height="100%" width="100%" borderRadius="full" background="primary" />
                    </MotiView>
                  )}
                </Box>
              </Box>
            ) : null}
            {header ? <Box flexShrink={0}>{header}</Box> : null}
            <Box flex={1} minHeight={0} overflow="hidden">
              {children}
            </Box>
          </Box>
        </Inset>
      </Box>
    </Page>
  );
}

/** Collapses to a single row while the keyboard is open so the focused field keeps its room. */
export function SafeToSpendHeader({
  amount,
  currency,
  change,
}: {
  readonly amount: number;
  readonly currency: string;
  readonly change: string | null;
}) {
  const { isKeyboardVisible: compact } = usePageKeyboard();
  const reduceMotion = useReducedMotion();

  const amountText = (variant: 'subheading' | 'hero') => (
    <MoneyText
      amount={amount}
      currencyCode={currency}
      formatStyle="sts"
      variant={variant}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={variant === 'hero' ? 0.6 : 0.7}
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
      {change ? (
        <Box paddingBottom="sm">
          <AppText
            variant="caption"
            color="secondary"
            numberOfLines={2}
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
