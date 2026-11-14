import { Spacing } from '@/src/constants';
import React from 'react';
import { Box } from '@/src/design-system';
import { SetupProgressBar } from '@/src/design-system/SetupProgressBar';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  label?: string;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  totalSteps,
  label = 'Setup',
}) => {
  const safeTotalSteps = Math.max(1, totalSteps);

  return (
    <Box paddingTop="lg" paddingBottom="sm">
      <SetupProgressBar
        label={label}
        current={currentStep}
        total={safeTotalSteps}
        valueLabel={`${Math.max(1, Math.min(currentStep, safeTotalSteps))} of ${safeTotalSteps}`}
        accessibilityLabel={`Step ${Math.max(1, Math.min(currentStep, safeTotalSteps))} of ${safeTotalSteps}`}
      />
    </Box>
  );
};