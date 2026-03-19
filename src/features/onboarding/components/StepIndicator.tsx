import { AppIcon } from '@/src/components/core/AppIcon';
import { Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Box, Inline } from '@/src/design-system';

interface StepIndicatorProps {
    currentStep: number;
    totalSteps: number;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
    currentStep,
    totalSteps,
}) => {
    const { theme } = useTheme();

    return (
        <Box alignItems="center" paddingVertical="md">
            <Inline align="center" justify="center">
                {Array.from({ length: totalSteps }, (_, index) => {
                    const stepNumber = index + 1;
                    const isActive = stepNumber === currentStep;
                    const isCompleted = stepNumber < currentStep;

                    return (
                        <Inline key={stepNumber} align="center">
                            <Box
                                height={Spacing.md}
                                borderRadius="full"
                                alignItems="center"
                                justifyContent="center"
                                width={isActive ? Size.lg : Spacing.md}
                                background={(isActive ? 'primary' : isCompleted ? 'success' : 'border') as any}
                                style={{
                                    borderWidth: 1,
                                    borderColor: isActive
                                        ? theme.primary
                                        : isCompleted
                                            ? theme.success
                                            : theme.border,
                                }}
                            >
                                {isCompleted && (
                                    <AppIcon name="check" size={Spacing.sm} color={theme.surface} strokeWidth={Spacing.xs} />
                                )}
                            </Box>
                            {index < totalSteps - 1 && (
                                <Box
                                    width={Size.xs}
                                    height={2}
                                    marginHorizontal="xs"
                                    borderRadius="r1"
                                    background={(isCompleted ? 'success' : 'border') as any}
                                />
                            )}
                        </Inline>
                    );
                })}
            </Inline>
        </Box>
    );
};

