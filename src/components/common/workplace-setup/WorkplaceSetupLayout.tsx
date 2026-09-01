import { AppButton } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { Box, Inset, Page } from '@/src/design-system';
import { StepIndicator } from '@/src/components/common/StepIndicator';
import React from 'react';
import { Platform } from 'react-native';

interface WorkplaceSetupLayoutProps {
  currentStep: number;
  totalSteps: number;
  children: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  keyboardAvoiding?: boolean;
  backAction?: () => void;
  backDisabled?: boolean;
}

export function WorkplaceSetupLayout({
  currentStep,
  totalSteps,
  children,
  edges = ['top', 'bottom'],
  keyboardAvoiding = true,
  backAction,
  backDisabled = false,
}: WorkplaceSetupLayoutProps) {
  return (
    <Page
      edges={edges}
      keyboardAvoiding={keyboardAvoiding}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
    >
      <Box flex={1}>
        <Inset horizontal="lg" top={0} bottom={0} flex={1}>
          <Box
            maxWidth={AppConfig.layout.maxContentWidth}
            width="100%"
            style={{ alignSelf: 'center' }}
            flex={1}
          >
            <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />
            <Box flex={1}>{children}</Box>
            {backAction ? (
              <AppButton variant="ghost" onPress={backAction} disabled={backDisabled}>
                Back
              </AppButton>
            ) : null}
          </Box>
        </Inset>
      </Box>
    </Page>
  );
}
