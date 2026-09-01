import { FontIds, ThemeIds } from '@/src/constants';
import { AppButton, AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { OnboardingReviewStep } from '@/src/features/onboarding';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { loadRestoreSummary, type RestoreSummaryView } from './setupFinishers';
import { getSetupRecipe, recipeContainsSlice } from './setupRecipes';
import type { SetupDraft, SetupSliceId } from './setupTypes';

type ImportedBooks =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly view: RestoreSummaryView };

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
  const [retryKey, setRetryKey] = useState(0);
  const [importedBooks, setImportedBooks] = useState<ImportedBooks>({ status: 'loading' });

  useEffect(() => {
    if (!imported) return;
    let cancelled = false;
    void (async () => {
      try {
        const view = await loadRestoreSummary(draft);
        if (cancelled) return;
        setImportedBooks(view ? { status: 'ready', view } : { status: 'failed' });
      } catch {
        if (!cancelled) setImportedBooks({ status: 'failed' });
      }
    })();
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
                  onPress={() => {
                    setImportedBooks({ status: 'loading' });
                    setRetryKey(key => key + 1);
                  }}
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

  const name = 'device' in draft ? (draft.device?.displayName.value ?? '') : '';
  const appearance = 'appearance' in draft ? draft.appearance : undefined;
  const accounts =
    importedBooks.status === 'ready'
      ? importedBooks.view.accounts
      : (workplace?.selectedAccounts.length ?? 0);
  const categories =
    importedBooks.status === 'ready'
      ? importedBooks.view.categories
      : (workplace?.selectedCategories.length ?? 0);

  return (
    <View testID="onboarding-summary-step" style={{ flex: 1 }}>
      <OnboardingReviewStep
        name={name}
        workplaceName={workplace?.name.value ?? ''}
        workplaceIcon={workplace?.icon.value ?? 'briefcase'}
        selectedCurrency={
          importedBooks.status === 'ready'
            ? importedBooks.view.currency
            : (workplace?.baseCurrency.value ?? '')
        }
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
