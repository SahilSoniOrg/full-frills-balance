import { AppText } from '@/src/components/core';
import { AppIcon } from '@/src/components/core/AppIcon';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

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
        <View style={styles.container}>
            <View style={styles.dotsContainer}>
                {Array.from({ length: totalSteps }, (_, index) => {
                    const stepNumber = index + 1;
                    const isActive = stepNumber === currentStep;
                    const isCompleted = stepNumber < currentStep;

                    return (
                        <View key={stepNumber} style={styles.stepWrapper}>
                            <View
                                style={[
                                    styles.dot,
                                    {
                                        backgroundColor: isActive
                                            ? theme.primary
                                            : isCompleted
                                                ? theme.success
                                                : theme.border,
                                        borderColor: isActive
                                            ? theme.primary
                                            : isCompleted
                                                ? theme.success
                                                : theme.border,
                                    },
                                ]}
                            >
                                {isCompleted && (
                                    <AppIcon name="check" size={8} color={theme.surface} strokeWidth={4} />
                                )}
                            </View>
                            {index < totalSteps - 1 && (
                                <View
                                    style={[
                                        styles.connector,
                                        {
                                            backgroundColor: isCompleted
                                                ? theme.success
                                                : theme.border,
                                        },
                                    ]}
                                />
                            )}
                        </View>
                    );
                })}
            </View>
            <AppText variant="caption" color="secondary" style={styles.stepText}>
                Step {currentStep} of {totalSteps}
            </AppText>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        paddingVertical: Spacing.md,
    },
    dotsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.sm,
    },
    stepWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    connector: {
        width: 24,
        height: 2,
        marginHorizontal: 4,
    },
    stepText: {
        fontSize: 12,
    },
});
