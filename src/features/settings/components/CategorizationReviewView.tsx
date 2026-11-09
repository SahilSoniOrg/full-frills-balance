import { AppButton, AppText, ListGroup, ListRow } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { Stack } from '@/src/design-system';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import type { TransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { Icon } from '@/src/types/domainIcons';
import { AppNavigation } from '@/src/utils/navigation';
import { formatDate } from '@/src/utils/dateUtils';
import { Fragment, useState } from 'react';

const REVIEW_PAGE_SIZE = 20;

export function CategorizationReviewView({ capture }: { capture: TransactionCaptureViewModel }) {
  const [visibleCount, setVisibleCount] = useState(REVIEW_PAGE_SIZE);
  const privateMode = useEffectivePrivacyMode();

  return (
    <SettingsLayout title={strings.reviewPageTitle}>
      <Stack space="lg">
        {capture.loading ? <AppText color="secondary">{strings.loading}</AppText> : null}
        {capture.error ? (
          <Stack space="sm">
            <AppText color="secondary">{strings.loadError}</AppText>
            <AppButton variant="secondary" onPress={() => void capture.onRetry()}>
              {strings.retry}
            </AppButton>
          </Stack>
        ) : null}

        <ListGroup
          variant="card"
          footer={capture.review.length > 0 ? strings.reviewHint : undefined}
        >
          {!capture.loading && !capture.error && capture.review.length === 0 ? (
            <ListRow icon={Icon.Check} title={strings.emptyReview} wrap />
          ) : null}
          {capture.review.slice(0, visibleCount).map(item => (
            <Fragment key={item.journalId}>
              <ListRow
                icon={Icon.Document}
                wrap
                title={
                  privateMode
                    ? strings.privateDescription
                    : item.description || strings.privateDescription
                }
                subtitle={`${formatDate(item.journalDate)} · ${!privateMode && item.suggestedCategoryName ? strings.suggestedCategory(item.suggestedCategoryName) : strings.reviewAction}`}
                trailing={<MoneyText amount={item.totalAmount} currencyCode={item.currencyCode} />}
                onPress={() =>
                  AppNavigation.toJournalEntry({
                    journalId: item.journalId,
                    workplaceId: capture.workplaceId,
                  })
                }
                testID={`capture-review-${item.journalId}`}
              />
              {!privateMode && !item.keepOpen && item.recurring ? (
                <AppText variant="caption" color="secondary">
                  {strings.recurringHint}
                </AppText>
              ) : null}
              {!privateMode && item.confirmCategoryKey && item.currentCategoryNames?.length ? (
                <AppButton
                  variant="secondary"
                  disabled={capture.busy || capture.loading}
                  onPress={() => void capture.onConfirmCategories(item)}
                >
                  {strings.confirmCurrentCategories(item.currentCategoryNames.join(', '))}
                </AppButton>
              ) : null}
              {!privateMode &&
              !item.keepOpen &&
              item.suggestedDefault &&
              item.suggestedDefaultAccountName ? (
                <AppButton
                  variant="secondary"
                  disabled={capture.busy || capture.loading}
                  onPress={() => capture.onRememberCategory(item)}
                >
                  {strings.rememberCategory}
                </AppButton>
              ) : null}
              {!privateMode && item.merchantKey ? (
                <AppButton
                  variant="ghost"
                  disabled={capture.busy || capture.loading}
                  onPress={() => capture.onSetMerchantOpen(item.merchantKey!, !item.keepOpen)}
                >
                  {item.keepOpen ? strings.allowMerchantSuggestions : strings.keepMerchantOpen}
                </AppButton>
              ) : null}
              {!privateMode &&
              !item.keepOpen &&
              item.descriptionDefaultKey &&
              item.description &&
              item.description.trim().toLowerCase() !== item.merchantKey ? (
                <AppButton
                  variant="ghost"
                  disabled={capture.busy || capture.loading}
                  onPress={() =>
                    capture.onSetDescriptionDefault(
                      item.descriptionDefaultKey!,
                      item.savedDescriptionDefault === item.description
                        ? undefined
                        : item.description,
                    )
                  }
                >
                  {item.savedDescriptionDefault === item.description
                    ? strings.forgetName
                    : strings.rememberName}
                </AppButton>
              ) : null}
            </Fragment>
          ))}
          {capture.review.length > visibleCount ? (
            <AppButton
              variant="ghost"
              onPress={() => setVisibleCount(count => count + REVIEW_PAGE_SIZE)}
            >
              {strings.showMore}
            </AppButton>
          ) : null}
        </ListGroup>
      </Stack>
    </SettingsLayout>
  );
}
