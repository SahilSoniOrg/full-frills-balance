import { AppConfig, Spacing } from '@/src/constants';
import { Box, Inset, Page } from '@/src/design-system';
import { StepIndicator } from '@/src/components/common/StepIndicator';
import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface WorkplaceSetupLayoutProps {
  currentStep: number;
  totalSteps: number;
  children: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  keyboardAvoiding?: boolean;
}

export function WorkplaceSetupLayout({
  currentStep,
  totalSteps,
  children,
  edges = ['bottom'],
  keyboardAvoiding = true,
}: WorkplaceSetupLayoutProps) {
  const insets = useSafeAreaInsets();

  // Robust top padding for notched devices, especially in Modals
  const topPadding = Platform.OS === 'ios' ? Math.max(insets.top, 44) : Spacing.lg;

  return (
    <Page
      edges={edges}
      keyboardAvoiding={keyboardAvoiding}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
    >
      <Box flex={1}>
        <Inset horizontal="lg" top={0} bottom={0} flex={1} style={{ paddingTop: topPadding }}>
          <Box
            maxWidth={AppConfig.layout.maxContentWidth}
            width="100%"
            style={{ alignSelf: 'center' }}
            flex={1}
          >
            <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />
            {children}
          </Box>
        </Inset>
      </Box>
    </Page>
  );
}
