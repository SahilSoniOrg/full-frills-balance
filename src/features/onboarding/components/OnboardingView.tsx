import { WorkplaceAccountSelectionStep } from '@/src/components/common/workplace-setup/WorkplaceAccountSelectionStep';
import { WorkplaceCategorySelectionStep } from '@/src/components/common/workplace-setup/WorkplaceCategorySelectionStep';
import { WorkplaceCurrencyStep } from '@/src/components/common/workplace-setup/WorkplaceCurrencyStep';
import { WorkplaceSetupLayout } from '@/src/components/common/workplace-setup/WorkplaceSetupLayout';
import { StepSplash } from '@/src/features/onboarding/components/StepSplash';
import { OnboardingWorkplaceStep } from '@/src/features/onboarding/components/OnboardingWorkplaceStep';
import { OnboardingThemeStep } from '@/src/features/onboarding/components/OnboardingThemeStep';
import { OnboardingReviewStep } from '@/src/features/onboarding/components/OnboardingReviewStep';
import { OnboardingFlowViewModel } from '@/src/features/onboarding/hooks/useOnboardingFlow';
import { View } from 'react-native';

export function OnboardingView(vm: OnboardingFlowViewModel) {
  const {
    stage,
    isFullSetup,
    step,
    name,
    setName,
    workplaceName,
    setWorkplaceName,
    workplaceIcon,
    setWorkplaceIcon,
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
    onRestore,
    onBack,
    onEdit,
    onFinish,
    importedSummary,
    isImportedWorkplace,
    themeId,
    setThemeId,
    fontId,
    setFontId,
  } = vm;

  const renderStep = () => {
    switch (stage) {
      case 'user_profile':
        return (
          <StepSplash
            key={step}
            name={name}
            setName={setName}
            onContinue={onContinue}
            onRestore={onRestore}
            isCompleting={isCompleting}
          />
        );
      case 'workplace_setup':
        if (step === 2) {
          return (
            <OnboardingWorkplaceStep
              key={step}
              name={workplaceName}
              icon={workplaceIcon}
              onNameChange={setWorkplaceName}
              onIconChange={setWorkplaceIcon}
              onContinue={onContinue}
              onBack={onBack}
              isCompleting={isCompleting}
            />
          );
        }
        if (step === 3) {
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
        }
        if (step === 4) {
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
        }
        return (
          <WorkplaceCategorySelectionStep
            key={step}
            selectedCategories={selectedCategories}
            customCategories={customCategories}
            onToggleCategory={onToggleCategory}
            onAddCustomCategory={onAddCustomCategory}
            onContinue={onContinue}
            onBack={onBack}
            isCompleting={isCompleting}
          />
        );
      case 'appearance':
        return (
          <OnboardingThemeStep
            key={step}
            currencyCode={selectedCurrency}
            onContinue={onContinue}
            onBack={onBack}
            isCompleting={isCompleting}
            themeId={themeId}
            fontId={fontId}
            onThemeChange={setThemeId}
            onFontChange={setFontId}
          />
        );
      case 'review':
        return (
          <OnboardingReviewStep
            key={step}
            name={name}
            workplaceName={
              isImportedWorkplace
                ? workplaceName
                : (importedSummary?.workplaceName ?? workplaceName)
            }
            workplaceIcon={importedSummary?.workplaceIcon ?? workplaceIcon}
            selectedCurrency={importedSummary?.currencyCode ?? selectedCurrency}
            accountCount={
              importedSummary?.accountCount ?? selectedAccounts.length + customAccounts.length
            }
            categoryCount={
              importedSummary?.categoryCount ?? selectedCategories.length + customCategories.length
            }
            themeId={themeId}
            fontId={fontId}
            onChangeWorkplace={() => onEdit('workplace')}
            onChangeProfile={() => onEdit('profile')}
            onChangeCurrency={() => onEdit('currency')}
            onChangeAccounts={() => onEdit('accounts')}
            onChangeCategories={() => onEdit('categories')}
            onChangeAppearance={() => onEdit('appearance')}
            onConfirm={onFinish}
            onBack={onBack}
            isCompleting={isCompleting}
            isImportedWorkplace={isImportedWorkplace}
            showAppearance={!isFullSetup}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View testID="onboarding-screen" style={{ flex: 1 }}>
      <WorkplaceSetupLayout
        currentStep={stage === 'user_profile' ? 1 : Math.min(step - 1, 6)}
        totalSteps={6}
      >
        {renderStep()}
      </WorkplaceSetupLayout>
    </View>
  );
}
