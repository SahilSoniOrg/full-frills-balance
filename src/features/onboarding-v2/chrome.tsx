import { AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { ONBOARDING_V2_STRINGS as copy } from '@/src/constants/copy/domains/onboardingV2Strings';
import { Box, Inline, Inset, Page } from '@/src/design-system';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import type { OnboardingV2Step } from './draft';

export type OnboardingStage = {
  readonly label: string;
  readonly current: number;
  readonly total: number;
};

export function OnboardingV2Chrome({
  stage,
  keyboardAvoiding,
  testID,
  children,
}: {
  readonly stage: OnboardingStage | null;
  readonly keyboardAvoiding: boolean;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  return (
    <Page
      testID={testID}
      edges={['top', 'bottom']}
      keyboardAvoiding={keyboardAvoiding}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
    >
      <Box flex={1}>
        <Inset horizontal="lg" top={0} bottom="sm" flex={1}>
          <Box
            maxWidth={AppConfig.layout.maxContentWidth}
            width="100%"
            style={{ alignSelf: 'center' }}
            flex={1}
          >
            {stage ? (
              <Box paddingTop="lg" paddingBottom="sm" accessibilityLabel={stage.label}>
                <Inline align="center" justify="space-between" marginBottom="sm">
                  <AppText variant="caption" color="secondary" weight="medium">
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
            <Box flex={1}>{children}</Box>
          </Box>
        </Inset>
      </Box>
    </Page>
  );
}

export const ONBOARDING_STAGES: Record<OnboardingV2Step, OnboardingStage | null> = {
  welcome: null,
  you: { label: copy.stageSpace, current: 1, total: 5 },
  workspace: { label: copy.stageSpace, current: 1, total: 5 },
  currency: { label: copy.stageSpace, current: 1, total: 5 },
  now: { label: copy.stageNow, current: 1, total: 5 },
  next: { label: copy.stageNext, current: 2, total: 5 },
  protect: { label: copy.stageProtect, current: 3, total: 5 },
  reserve: { label: copy.stageReserve, current: 4, total: 5 },
  clarity: { label: copy.stageClarity, current: 5, total: 5 },
  review: { label: copy.stageClarity, current: 5, total: 5 },
};
