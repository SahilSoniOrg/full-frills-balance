import { WorkplaceAccountSelectionStep } from '@/src/components/common/workplace-setup/WorkplaceAccountSelectionStep';
import { WorkplaceCategorySelectionStep } from '@/src/components/common/workplace-setup/WorkplaceCategorySelectionStep';
import { WorkplaceCurrencyStep } from '@/src/components/common/workplace-setup/WorkplaceCurrencyStep';
import { WorkplaceSetupLayout } from '@/src/components/common/workplace-setup/WorkplaceSetupLayout';
import { OnboardingThemeStep } from '@/src/features/onboarding/components/OnboardingThemeStep';
import { StepFinalize } from '@/src/features/onboarding/components/StepFinalize';
import { StepSplash } from '@/src/features/onboarding/components/StepSplash';
import { OnboardingFlowViewModel } from '@/src/features/onboarding/hooks/useOnboardingFlow';
import { View } from 'react-native';

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
    onImport,
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
            onImport={onImport}
            isCompleting={isCompleting}
          />
        );
      case 2:
        return (
          <WorkplaceCurrencyStep
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
          <WorkplaceAccountSelectionStep
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
          <WorkplaceCategorySelectionStep
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
    <View testID="onboarding-screen" style={{ flex: 1 }}>
      <WorkplaceSetupLayout currentStep={step} totalSteps={6}>
        {renderStep()}
      </WorkplaceSetupLayout>
    </View>
  );
}
