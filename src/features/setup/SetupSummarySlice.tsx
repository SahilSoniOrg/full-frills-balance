import { FontIds, ThemeIds } from '@/src/constants';
import { AppButton, AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { SetupReviewStep } from './SetupReviewStep';
import { View } from 'react-native';
import { useEffect, useState } from 'react';
import { loadRestoreSummaries, type RestoreSummaryView } from './setupFinishers';
import { getSetupRecipe, recipeContainsSlice } from './setupRecipes';
import type { SetupDraft, SetupSliceId } from './setupTypes';

type ImportedBooks =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly views: readonly RestoreSummaryView[] };

export function SetupSummarySlice({
  draft,
  isCompleting,
  onEdit,
  onConfirm,
  onBack,
}: {
  readonly draft: SetupDraft;
  readonly isCompleting: boolean;
  readonly onEdit: (
    sliceId: SetupSliceId,
    targetStep?: 'identity' | 'currency' | 'accounts' | 'categories',
  ) => void;
  readonly onConfirm: () => void;
  readonly onBack: () => void;
}) {
  const imported = draft.kind === 'restore';
  const workplace = draft.workplace;
  const [retryKey, setRetryKey] = useState(0);
  const [importedBooks, setImportedBooks] = useState<ImportedBooks>({ status: 'loading' });
  const name = 'device' in draft ? (draft.device?.displayName.value ?? '') : '';
  const appearance = 'appearance' in draft ? draft.appearance : undefined;

  useEffect(() => {
    if (!imported) return;
    let cancelled = false;
    void loadRestoreSummaries(draft).then(
      views => {
        if (cancelled) return;
        setImportedBooks(views?.length ? { status: 'ready', views } : { status: 'failed' });
      },
      () => {
        if (!cancelled) setImportedBooks({ status: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [draft, imported, retryKey]);

  if (imported && importedBooks.status !== 'ready') {
    return (
      <View testID="onboarding-summary-step" style={{ flex: 1 }}>
        <Box flex={1} padding="lg">
          <Stack gap="md">
            {importedBooks.status === 'loading' ? (
              <AppText variant="body" color="secondary">
                Verifying imported books...
              </AppText>
            ) : (
              <>
                <AppText variant="body" color="secondary">
                  Imported books could not be verified. Retry before confirming.
                </AppText>
                <AppButton
                  variant="outline"
                  testID="onboarding-summary-retry"
                  onPress={() => setRetryKey(key => key + 1)}
                  disabled={isCompleting}
                >
                  Retry
                </AppButton>
              </>
            )}
            <AppButton variant="ghost" onPress={onBack} disabled={isCompleting}>
              Back
            </AppButton>
          </Stack>
        </Box>
      </View>
    );
  }

  const accounts = imported
    ? importedBooks.status === 'ready'
      ? (importedBooks.views[0]?.accounts ?? 0)
      : 0
    : (workplace?.selectedAccounts.length ?? 0);
  const categories = imported
    ? importedBooks.status === 'ready'
      ? (importedBooks.views[0]?.categories ?? 0)
      : 0
    : (workplace?.selectedCategories.length ?? 0);
  const selectedCurrency =
    imported && importedBooks.status === 'ready'
      ? (importedBooks.views[0]?.currency ?? '')
      : (workplace?.baseCurrency.value ?? '');

  return (
    <View testID="onboarding-summary-step" style={{ flex: 1 }}>
      <SetupReviewStep
        name={name}
        workplaceName={workplace?.name.value ?? ''}
        workplaceIcon={workplace?.icon.value ?? 'briefcase'}
        selectedCurrency={selectedCurrency}
        accountCount={accounts}
        categoryCount={categories}
        themeId={appearance?.themeId.value ?? ThemeIds.DEEP_SPACE}
        fontId={appearance?.fontId.value ?? FontIds.DEEP_SPACE}
        onChangeWorkplace={() => onEdit('workplace', 'identity')}
        onChangeProfile={() => onEdit('device')}
        onChangeCurrency={() => onEdit('workplace', 'currency')}
        onChangeAccounts={() => onEdit('workplace', 'accounts')}
        onChangeCategories={() => onEdit('workplace', 'categories')}
        onChangeAppearance={() => onEdit('appearance')}
        onConfirm={onConfirm}
        onBack={onBack}
        isCompleting={isCompleting}
        isImportedWorkplace={imported}
        importedWorkplaces={imported && importedBooks.status === 'ready' ? importedBooks.views : []}
        workplaceEditable={!imported}
        showAppearance={'appearance' in draft}
        showProfile={recipeContainsSlice(getSetupRecipe(draft.journeyId), 'device')}
      />
    </View>
  );
}
