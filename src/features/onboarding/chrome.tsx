import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Box, Inline, Inset, Page, useKeyboard } from '@/src/design-system';
import type { ReactNode } from 'react';
import type { OnboardingStep } from './draft';

export type OnboardingStage = {
  readonly label: string;
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

export const ONBOARDING_STAGES: Record<OnboardingStep, OnboardingStage | null> = {
  welcome: null,
  currency: { label: copy.stageSpace, current: 1, total: 6 },
  now: { label: copy.stageNow, current: 2, total: 6 },
  next: { label: copy.stageNext, current: 3, total: 6 },
  protect: { label: copy.stageProtect, current: 4, total: 6 },
  reserve: { label: copy.stageReserve, current: 5, total: 6 },
  clarity: { label: copy.stageClarity, current: 6, total: 6 },
};
