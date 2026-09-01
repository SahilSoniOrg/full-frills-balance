import { FontIds, ThemeIds } from '@/src/constants';
import { SetupReviewStep } from './SetupReviewStep';
import { View } from 'react-native';
import { useEffect, useState } from 'react';
import { loadRestoreSummary } from './setupFinishers';
import { getSetupRecipe, recipeContainsSlice } from './setupRecipes';
import type { SetupDraft, SetupSliceId } from './setupTypes';

function restoreHandoffCounts(draft: SetupDraft) {
  if (draft.kind !== 'restore') return undefined;
  const stats = draft.restore.handoff?.stats;
  if (stats?.categories === undefined) return undefined;
  return { accounts: stats.accounts, categories: stats.categories };
}

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
  const name = 'device' in draft ? (draft.device?.displayName.value ?? '') : '';
  const appearance = 'appearance' in draft ? draft.appearance : undefined;
  const fromHandoff = restoreHandoffCounts(draft);
  const [publishedCounts, setPublishedCounts] = useState<{
    readonly accounts: number;
    readonly categories: number;
  }>();

  useEffect(() => {
    if (restoreHandoffCounts(draft) || draft.kind !== 'restore') return;
    let cancelled = false;
    void loadRestoreSummary(draft)
      .then(view => {
        if (cancelled || !view) return;
        setPublishedCounts({ accounts: view.accounts, categories: view.categories });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [draft]);

  const restoreCounts = fromHandoff ?? publishedCounts;
  const accounts = imported
    ? (restoreCounts?.accounts ?? 0)
    : (workplace?.selectedAccounts.length ?? 0);
  const categories = imported
    ? (restoreCounts?.categories ?? 0)
    : (workplace?.selectedCategories.length ?? 0);

  return (
    <View testID="onboarding-summary-step" style={{ flex: 1 }}>
      <SetupReviewStep
        name={name}
        workplaceName={workplace?.name.value ?? ''}
        workplaceIcon={workplace?.icon.value ?? 'briefcase'}
        selectedCurrency={workplace?.baseCurrency.value ?? ''}
        accountCount={accounts}
        categoryCount={categories}
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
