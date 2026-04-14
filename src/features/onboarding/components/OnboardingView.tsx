import { AppConfig } from '@/src/constants/app-config';
import { Box, Inset, Page } from '@/src/design-system';
import { OnboardingAccountSelectionStep } from '@/src/features/onboarding/components/OnboardingAccountSelectionStep';
import { OnboardingCategorySelectionStep } from '@/src/features/onboarding/components/OnboardingCategorySelectionStep';
import { OnboardingCurrencyStep } from '@/src/features/onboarding/components/OnboardingCurrencyStep';
import { OnboardingThemeStep } from '@/src/features/onboarding/components/OnboardingThemeStep';
import { StepFinalize } from '@/src/features/onboarding/components/StepFinalize';
import { StepIndicator } from '@/src/features/onboarding/components/StepIndicator';
import { StepSplash } from '@/src/features/onboarding/components/StepSplash';
import { OnboardingFlowViewModel } from '@/src/features/onboarding/hooks/useOnboardingFlow';
import React from 'react';
import { Platform } from 'react-native';

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
            key={step}
            name={name}
            setName={setName}
            onContinue={onContinue}
            isCompleting={isCompleting}
          />
        );
      case 2:
        return (
          <OnboardingCurrencyStep
            key={step}
            selectedCurrency={selectedCurrency}
            onSelectCurrency={setSelectedCurrency}
            onContinue={onContinue}
            onBack={onBack}
            isCompleting={isCompleting}
          />
        );
      case 3:
        return (
          <OnboardingAccountSelectionStep
            key={step}
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
          <OnboardingCategorySelectionStep
            key={step}
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
          <OnboardingThemeStep
            key={step}
            onContinue={onContinue}
            onBack={onBack}
            isCompleting={false}
          />
        );
      case 6:
        return <StepFinalize key={step} onFinish={onFinish} isCompleting={isCompleting} />;
      default:
        return null;
    }
  };

  return (
    <Page
      edges={['top', 'bottom']}
      keyboardAvoiding
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 80}
    >
      <Box flex={1}>
        <Inset horizontal="lg" top="lg" bottom={0} flex={1}>
          <Box
            maxWidth={AppConfig.layout.maxContentWidth}
            width="100%"
            style={{ alignSelf: 'center' }}
            flex={1}
          >
            <StepIndicator currentStep={step} totalSteps={6} />
            {renderStep()}
          </Box>
        </Inset>
      </Box>
    </Page>
  );
}
