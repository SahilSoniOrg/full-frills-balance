import { FontIds, ThemeIds } from '@/src/constants';
import { OnboardingReviewStep } from '@/src/features/onboarding';
import { View } from 'react-native';
import { getSetupRecipe, recipeContainsSlice } from './setupRecipes';
import type { SetupDraft, SetupSliceId } from './setupTypes';

export function SetupSummarySlice({
  draft,
  isCompleting,
  onEdit,
  onConfirm,
  onBack,
}: {
  readonly draft: SetupDraft;
  readonly isCompleting: boolean;
  readonly onEdit: (sliceId: SetupSliceId) => void;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}) {
  const name = 'device' in draft ? (draft.device?.displayName.value ?? '') : '';
  const workplace = draft.workplace;
  const appearance = 'appearance' in draft ? draft.appearance : undefined;
  return (
    <View testID="onboarding-summary-step" style={{ flex: 1 }}>
      <OnboardingReviewStep
        name={name}
        workplaceName={workplace?.name.value ?? ''}
        workplaceIcon={workplace?.icon.value ?? 'briefcase'}
        selectedCurrency={workplace?.baseCurrency.value ?? ''}
        accountCount={workplace?.selectedAccounts.length ?? 0}
        categoryCount={workplace?.selectedCategories.length ?? 0}
        themeId={appearance?.themeId.value ?? ThemeIds.DEEP_SPACE}
        fontId={appearance?.fontId.value ?? FontIds.DEEP_SPACE}
        onChangeWorkplace={() => onEdit('workplace')}
        onChangeProfile={() => onEdit('device')}
        onChangeCurrency={() => onEdit('workplace')}
        onChangeAccounts={() => onEdit('workplace')}
        onChangeCategories={() => onEdit('workplace')}
        onChangeAppearance={() => onEdit('appearance')}
        onConfirm={onConfirm}
        onBack={onBack}
        isCompleting={isCompleting}
        isImportedWorkplace={false}
        showAppearance={'appearance' in draft}
        showProfile={recipeContainsSlice(getSetupRecipe(draft.journeyId), 'device')}
      />
    </View>
  );
}
