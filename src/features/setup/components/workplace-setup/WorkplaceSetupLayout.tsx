import { AppButton } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Page, SetupProgressBar } from '@/src/design-system';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import React from 'react';

interface WorkplaceSetupLayoutProps {
  currentStep: number;
  totalSteps: number;
  stepName?: string;
  children: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  keyboardAvoiding?: boolean;
  backAction?: () => void;
  backDisabled?: boolean;
  testID?: string;
}

export function WorkplaceSetupLayout({
  currentStep,
  totalSteps,
  stepName = copy.progressSetup,
  children,
  edges = ['top', 'bottom'],
  keyboardAvoiding = true,
  backAction,
  backDisabled = false,
  testID,
}: WorkplaceSetupLayoutProps) {
  return (
    <Page testID={testID} edges={edges} keyboardAvoiding={keyboardAvoiding}>
      <Box flex={1}>
        <Box paddingHorizontal="lg" paddingTop={0} paddingBottom="sm" flex={1}>
          <Box
            maxWidth={AppConfig.layout.maxContentWidth}
            width="100%"
            style={{ alignSelf: 'center' }}
            flex={1}
          >
            <Box paddingTop="lg" paddingBottom="sm">
              <SetupProgressBar
                label={copy.stageProgress(currentStep, totalSteps, stepName)}
                current={currentStep}
                total={totalSteps}
              />
            </Box>
            <Box flex={1}>{children}</Box>
            {backAction ? (
              <AppButton variant="ghost" onPress={backAction} disabled={backDisabled}>
                {copy.back}
              </AppButton>
            ) : null}
          </Box>
        </Box>
      </Box>
    </Page>
  );
}
