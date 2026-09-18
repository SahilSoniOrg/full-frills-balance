import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { Box, Inline, Inset, Page, useKeyboard } from '@/src/design-system';
import type { ReactNode } from 'react';
import type { OnboardingStep } from './draft';
import { ONBOARDING_FLOW, ONBOARDING_PROGRESS_FLOW } from './flow';

export type OnboardingStage = {
  readonly label: string;
  readonly name: string;
  readonly current: number;
  readonly total: number;
};

export function OnboardingChrome({
  stage,
  renderHeader,
  testID,
  children,
}: {
  readonly stage: OnboardingStage | null;
  readonly renderHeader?: (context: { readonly isKeyboardVisible: boolean }) => ReactNode;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const { isKeyboardVisible } = useKeyboard();
  const header = renderHeader?.({ isKeyboardVisible });

  return (
    <Page testID={testID} edges={isKeyboardVisible ? ['top'] : ['top', 'bottom']}>
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
                  <Box
                    height="100%"
                    width={`${(stage.current / stage.total) * 100}%`}
                    borderRadius="full"
                    background="primary"
                  />
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

const progressTotal = ONBOARDING_PROGRESS_FLOW.length;

export const ONBOARDING_STAGES: Record<OnboardingStep, OnboardingStage | null> = Object.fromEntries(
  ONBOARDING_FLOW.map(entry => {
    if (!entry.progressName) return [entry.step, null];
    const current = ONBOARDING_PROGRESS_FLOW.findIndex(item => item.step === entry.step) + 1;
    const label = `Step ${current} of ${progressTotal} · ${entry.progressName}`;
    return [entry.step, { label, name: entry.progressName, current, total: progressTotal }];
  }),
) as Record<OnboardingStep, OnboardingStage | null>;
