import { FontIds, ThemeIds } from '@/src/constants';
import { OnboardingReviewStep } from '@/src/features/onboarding';
import { workplaceService } from '@/src/services/WorkplaceService';
import { useEffect, useState } from 'react';
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
  const imported = draft.kind === 'restore';
  const workplace = draft.workplace;
  const [bookStats, setBookStats] = useState({ accounts: 0, categories: 0 });
  const workplaceId = imported ? draft.restore.handoff?.workplaceId : undefined;

  useEffect(() => {
    if (!workplaceId) return;
    let cancelled = false;
    void workplaceService
      .getPublishedBookStats(workplaceId)
      .then(stats => {
        if (!cancelled) setBookStats({ accounts: stats.accounts, categories: stats.categories });
      })
      .catch(() => {
        if (!cancelled) setBookStats({ accounts: 0, categories: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [workplaceId]);

  const name = 'device' in draft ? (draft.device?.displayName.value ?? '') : '';
  const appearance = 'appearance' in draft ? draft.appearance : undefined;
  return (
    <View testID="onboarding-summary-step" style={{ flex: 1 }}>
      <OnboardingReviewStep
        name={name}
        workplaceName={workplace?.name.value ?? ''}
        workplaceIcon={workplace?.icon.value ?? 'briefcase'}
        selectedCurrency={workplace?.baseCurrency.value ?? ''}
        accountCount={imported ? bookStats.accounts : (workplace?.selectedAccounts.length ?? 0)}
        categoryCount={
          imported ? bookStats.categories : (workplace?.selectedCategories.length ?? 0)
        }
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
        isImportedWorkplace={imported}
        workplaceEditable
        showAppearance={'appearance' in draft}
        showProfile={recipeContainsSlice(getSetupRecipe(draft.journeyId), 'device')}
      />
    </View>
  );
}
