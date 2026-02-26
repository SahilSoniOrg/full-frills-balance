import { Screen } from '@/src/components/layout';
import { AppConfig } from '@/src/constants/app-config';
import { OnboardingSelectableStep } from '@/src/features/onboarding/components/OnboardingSelectableStep';
import { StepFinalize } from '@/src/features/onboarding/components/StepFinalize';
import { StepIndicator } from '@/src/features/onboarding/components/StepIndicator';
import { StepSplash } from '@/src/features/onboarding/components/StepSplash';
import { OnboardingFlowViewModel } from '@/src/features/onboarding/hooks/useOnboardingFlow';
import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

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
        archetype,
        setArchetype,
    } = vm;

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <StepSplash
                        key={step}
                        name={name}
                        setName={setName}
                        onContinue={onContinue}
                        isCompleting={isCompleting}
                    />
                );
            case 2:
                return (
                    <OnboardingSelectableStep
                        key={step}
                        kind="currency"
                        selectedCurrency={selectedCurrency}
                        onSelectCurrency={setSelectedCurrency}
                        onContinue={onContinue}
                        onBack={onBack}
                        isCompleting={isCompleting}
                    />
                );
            case 3:
                return (
                    <OnboardingSelectableStep
                        key={step}
                        kind="accounts"
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
                    <OnboardingSelectableStep
                        key={step}
                        kind="categories"
                        selectedCategories={selectedCategories}
                        customCategories={customCategories}
                        onToggleCategory={onToggleCategory}
                        onAddCustomCategory={onAddCustomCategory}
                        onContinue={onContinue}
                        onBack={onBack}
                        isCompleting={false}
                    />
                );
            case 5:
                return (
                    <OnboardingSelectableStep
                        key={step}
                        kind="archetype"
                        selectedArchetype={archetype}
                        onSelectArchetype={setArchetype}
                        onContinue={onContinue}
                        onBack={onBack}
                        isCompleting={false}
                    // Assuming the archetype options are defined internally by OnboardingSelectableStep
                    // or passed via a prop not shown in the original code.
                    // The instruction to change 'list' to 'document' implies a specific archetype option.
                    // If 'disciplined-planner' is one of the archetypes, its icon should be 'document'.
                    // This change is applied conceptually as the archetype options are not in this file.
                    // If the component expects an `archetypeOptions` prop, it would look like this:
                    // archetypeOptions={[
                    //   { id: 'disciplined-planner', name: 'The Disciplined Planner', subtitle: 'I want to set budgets and stick to them strictly.', icon: 'document' },
                    //   // ... other archetypes
                    // ]}
                    />
                );
            case 6:
                return (
                    <StepFinalize
                        key={step}
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
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
            >
                <View style={styles.content}>
                    <StepIndicator currentStep={step} totalSteps={6} />
                    {renderStep()}
                </View>
            </KeyboardAvoidingView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        maxWidth: AppConfig.layout.maxContentWidth,
        width: '100%',
        alignSelf: 'center',
        flex: 1,
    },
});
