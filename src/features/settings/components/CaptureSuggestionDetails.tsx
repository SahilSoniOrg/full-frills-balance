import { AppButton, AppText } from '@/src/components/core';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { descriptionScope } from '@/src/features/settings/utils/descriptionScope';
import { Box, Inline, Stack } from '@/src/design-system';
import type { TransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import { type CaptureReviewItem } from '@/src/services/transaction-intelligence/captureReviewService';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { formatDate } from '@/src/utils/dateFormatting';
import { categoryDefaultKey } from '@/src/domain/transaction-intelligence/categoryDefaults';
import { SuggestionAccountLabel } from './SuggestionAccountLabel';
import { useTheme } from '@/src/hooks/use-theme';
import { StyleSheet, View } from 'react-native';

export { HistoricalPatternRow } from './CaptureSuggestionHistoricalPattern';

export function DefaultedDetail({
  capture,
  item,
}: {
  capture: TransactionCaptureViewModel;
  item: CaptureReviewItem;
}) {
  return (
    <Box paddingHorizontal="md" paddingVertical="sm">
      <Stack gap="sm">
        <AppText variant="bodySmall" color="secondary">
          {`${strings.reviewTransaction} · ${formatDate(item.journalDate)} · ${item.currentCategoryNames?.join(', ') || strings.defaultedReview}. Confirming records this journal only; it does not create a future default.`}
        </AppText>
        <View style={styles.actions}>
          <AppButton
            size="sm"
            buttonStyle={styles.action}
            variant="outline"
            onPress={() => AppNavigation.toJournalDetails(item.journalId)}
            disabled={capture.busy}
          >
            {strings.openTransaction}
          </AppButton>
          {item.confirmCategoryKey && item.currentCategoryNames?.length ? (
            <AppButton
              size="sm"
              buttonStyle={styles.action}
              variant="primary"
              disabled={capture.busy || capture.loading}
              onPress={() => void capture.onConfirmCategories(item)}
            >
              {strings.confirmCurrentCategories(item.currentCategoryNames.join(', '))}
            </AppButton>
          ) : (
            <AppText variant="caption" color="secondary">
              {strings.confirmationUnavailable}
            </AppText>
          )}
        </View>
      </Stack>
    </Box>
  );
}

export function CategoryCandidateDetail({
  capture,
  item,
}: {
  capture: TransactionCaptureViewModel;
  item: CaptureReviewItem;
}) {
  const choice = item.suggestedDefault;
  const existing =
    choice && capture.categoryDefaults?.find(value => value.key === categoryDefaultKey(choice));
  const hasDifferentDefault =
    !!existing && (existing.conflicted || existing.categoryAccountId !== choice?.categoryAccountId);
  const merchant = item.merchantName ?? choice?.merchant ?? item.merchantKey;
  const description = item.description?.trim();
  const distinctDescription =
    description && description.toLocaleLowerCase() !== merchant?.trim().toLocaleLowerCase();
  return (
    <Box paddingHorizontal="md" paddingVertical="sm">
      <Stack gap="sm">
        <AppText variant="caption" weight="bold">
          Evidence
        </AppText>
        <AppText variant="bodySmall" color="secondary">
          {`${strings.confirmedCaptureEvidence} · ${formatDate(item.journalDate)}${distinctDescription ? ` · ${description}` : ''}`}
        </AppText>
        <ScopePanel>
          <AppText variant="caption" color="secondary" weight="semibold">
            Future default
          </AppText>
          {choice ? (
            <>
              <AppText variant="body" weight="semibold">
                {item.suggestedCategoryName ?? strings.unavailableCategory}
              </AppText>
              <Inline wrap align="center">
                <AppText variant="caption" color="secondary">
                  {`${merchant ?? strings.unknownMerchant} · `}
                </AppText>
                <SuggestionAccountLabel
                  account={item.suggestedDefaultAccount}
                  name={item.suggestedDefaultAccountName}
                  placeholder={strings.unavailableAccount}
                />
                <AppText variant="caption" color="secondary">
                  {` · ${choice.currencyCode} · ${choice.kind}`}
                </AppText>
              </Inline>
              <AppText variant="caption" color="secondary">
                Applies to future matches. Existing entries stay unchanged.
              </AppText>
            </>
          ) : (
            <AppText variant="bodySmall">{strings.categorySuggestionUnavailable}</AppText>
          )}
        </ScopePanel>
        <View style={styles.actions}>
          {hasDifferentDefault ? (
            <AppText variant="bodySmall" color="secondary">
              {existing?.conflicted
                ? strings.conflictedCategoryDefaultHint
                : strings.existingCategoryDefaultHint}
            </AppText>
          ) : null}
          {!item.keepOpen &&
          !hasDifferentDefault &&
          choice &&
          item.suggestedCategoryName &&
          item.suggestedDefaultAccountName ? (
            <AppButton
              size="sm"
              buttonStyle={styles.action}
              variant="primary"
              disabled={capture.busy || capture.loading}
              onPress={() => capture.onRememberCategory(item)}
            >
              {'Save default'}
            </AppButton>
          ) : null}
          <AppButton
            size="sm"
            buttonStyle={styles.action}
            variant="ghost"
            onPress={() => AppNavigation.toJournalDetails(item.journalId)}
            disabled={capture.busy}
          >
            {strings.openTransaction}
          </AppButton>
          {item.merchantKey ? (
            <AppButton
              size="sm"
              buttonStyle={styles.action}
              variant="ghost"
              disabled={capture.busy || capture.loading}
              onPress={() =>
                void capture.onSetMerchantOpen(item.merchantName ?? item.merchantKey!, true)
              }
            >
              {'Always review'}
            </AppButton>
          ) : null}
        </View>
      </Stack>
    </Box>
  );
}

export function NameCandidateDetail({
  capture,
  item,
}: {
  capture: TransactionCaptureViewModel;
  item: CaptureReviewItem;
}) {
  const scope = descriptionScope(item);
  return (
    <Box paddingHorizontal="md" paddingVertical="sm">
      <Stack gap="sm">
        <AppText variant="caption" weight="bold">
          Evidence
        </AppText>
        <AppText variant="bodySmall" color="secondary">
          {`${strings.confirmedCaptureEvidence} · ${formatDate(item.journalDate)} · ${item.merchantName ?? item.merchantKey ?? strings.unknownMerchant}`}
        </AppText>
        <ScopePanel>
          <AppText variant="caption" weight="bold">
            Future default
          </AppText>
          <AppText variant="bodySmall">
            {strings.nameScope(
              item.merchantName ?? item.merchantKey ?? strings.unknownMerchant,
              scope.amount == null ? undefined : String(scope.amount),
              scope.currencyCode,
              scope.kind,
              item.description || strings.privateDescription,
            )}
          </AppText>
        </ScopePanel>
        <View style={styles.actions}>
          {item.descriptionDefaultKey && item.description ? (
            <AppButton
              size="sm"
              buttonStyle={styles.action}
              variant="primary"
              disabled={capture.busy || capture.loading}
              onPress={() =>
                capture.onSetDescriptionDefault(item.descriptionDefaultKey!, item.description)
              }
            >
              {'Save name'}
            </AppButton>
          ) : null}
          <AppButton
            size="sm"
            buttonStyle={styles.action}
            variant="ghost"
            onPress={() => AppNavigation.toJournalDetails(item.journalId)}
            disabled={capture.busy}
          >
            {strings.openTransaction}
          </AppButton>
          {item.merchantKey ? (
            <AppButton
              size="sm"
              buttonStyle={styles.action}
              variant="ghost"
              disabled={capture.busy || capture.loading}
              onPress={() =>
                void capture.onSetMerchantOpen(item.merchantName ?? item.merchantKey!, true)
              }
            >
              {'Always review'}
            </AppButton>
          ) : null}
        </View>
      </Stack>
    </Box>
  );
}

function ScopePanel({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return <View style={[styles.scope, { borderColor: theme.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  action: { minHeight: 44, paddingHorizontal: 14 },
  scope: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
});
