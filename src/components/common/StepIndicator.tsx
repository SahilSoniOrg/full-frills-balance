import { AppText } from '@/src/components/core/AppText';
import { Spacing } from '@/src/constants';
import React from 'react';
import { Box, Inline } from '@/src/design-system';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep, totalSteps }) => {
  const safeTotalSteps = Math.max(1, totalSteps);
  const boundedStep = Math.max(1, Math.min(currentStep, safeTotalSteps));
  const progress = `${boundedStep} of ${safeTotalSteps}`;

  return (
    <Box paddingTop="lg" paddingBottom="sm" accessibilityLabel={`Step ${progress}`}>
      <Inline align="center" justify="space-between" marginBottom="sm">
        <AppText variant="caption" color="secondary" weight="medium">
          Setup
        </AppText>
        <AppText variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
          {progress}
        </AppText>
      </Inline>
      <Box height={Spacing.xs} borderRadius="full" background="border" overflow="hidden">
        <Box
          height="100%"
          width={`${(boundedStep / safeTotalSteps) * 100}%`}
          borderRadius="full"
          background="primary"
        />
      </Box>
    </Box>
  );
};
