import { Screen } from '@/src/components/layout';
import { StepAccountSuggestions } from '@/src/features/onboarding/components/StepAccountSuggestions';
import { StepCategorySuggestions } from '@/src/features/onboarding/components/StepCategorySuggestions';
import { StepCurrency } from '@/src/features/onboarding/components/StepCurrency';
import { StepFinalize } from '@/src/features/onboarding/components/StepFinalize';
import { StepIndicator } from '@/src/features/onboarding/components/StepIndicator';
import { StepSplash } from '@/src/features/onboarding/components/StepSplash';
import { OnboardingFlowViewModel } from '@/src/features/onboarding/hooks/useOnboardingFlow';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export function OnboardingView(vm: OnboardingFlowViewModel) {
    const {
        step,
        name,
        setName,
        selectedCurrency,
        setSelectedCurrency,
        selectedAccounts,
        customAccounts,
        onToggleAccount,
        onAddCustomAccount,
        selectedCategories,
        customCategories,
        onToggleCategory,
        onAddCustomCategory,
        isCompleting,
        onContinue,
        onBack,
        onFinish,
    } = vm;

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <StepSplash
                        name={name}
                        setName={setName}
                        onContinue={onContinue}
                        isCompleting={isCompleting}
                    />
                );
            case 2:
                return (
                    <StepCurrency
                        selectedCurrency={selectedCurrency}
                        onSelect={setSelectedCurrency}
                        onContinue={onContinue}
                        onBack={onBack}
                        isCompleting={isCompleting}
                    />
                );
            case 3:
                return (
                    <StepAccountSuggestions
                        selectedAccounts={selectedAccounts}
                        customAccounts={customAccounts}
                        onToggleAccount={onToggleAccount}
                        onAddCustomAccount={onAddCustomAccount}
                        onContinue={onContinue}
                        onBack={onBack}
                        isCompleting={isCompleting}
                    />
                );
            case 4:
                return (
                    <StepCategorySuggestions
                        selectedCategories={selectedCategories}
                        customCategories={customCategories}
                        onToggleCategory={onToggleCategory}
                        onAddCustomCategory={onAddCustomCategory}
                        onContinue={onContinue}
                        onBack={onBack}
                        isCompleting={isCompleting}
                    />
                );
            case 5:
                return (
                    <StepFinalize
                        onFinish={onFinish}
                        isCompleting={isCompleting}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <Screen showBack={false} withPadding edges={['top', 'bottom']}>
            <View style={styles.content}>
                <StepIndicator currentStep={step} totalSteps={5} />
                {renderStep()}
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
        flex: 1,
    },
});
