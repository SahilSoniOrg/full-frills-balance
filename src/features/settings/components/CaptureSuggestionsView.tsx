import {
  AppButton,
  AppCard,
  AppText,
  Badge,
  ListGroup,
  ListRow,
  PressScaleTouchable,
} from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { Box, Stack } from '@/src/design-system';
import { withPrivacyScope, useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { SettingsLayout } from '@/src/features/settings/components/SettingsLayout';
import type { TransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import { Icon } from '@/src/types/domainIcons';
import { AppNavigation } from '@/src/utils/navigation';
import { formatDate } from '@/src/utils/dateUtils';
import { useTransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import { Fragment, useState } from 'react';

const PAGE_SIZE = 20;
type SuggestionsTab = 'review' | 'saved';
interface CaptureSuggestionsViewProps {
  capture: TransactionCaptureViewModel;
}

export function CaptureSuggestionsView({ capture }: CaptureSuggestionsViewProps) {
  const [tab, setTab] = useState<SuggestionsTab>('review');
  const privateMode = useEffectivePrivacyMode();
  const reviewCount =
    capture.defaulted.length +
    capture.categoryCandidates.length +
    capture.historicalCategorySuggestions.length +
    capture.mixedHistoricalCategoryCount +
    capture.descriptionCandidates.length;
  const savedCount = capture.categoryDefaults.length + capture.descriptionDefaults.length;

  return (
    <SettingsLayout title={strings.suggestionsTitle}>
      <Stack space="lg">
        <Stack space="sm">
          <SuggestionsSectionCard
            id="review"
            title={strings.suggestionsReviewTab()}
            description={strings.suggestionsReviewCardDescription}
            count={reviewCount}
            selected={tab === 'review'}
            showCount={capture.hasSnapshot && !privateMode}
            onPress={() => setTab('review')}
          />
          <SuggestionsSectionCard
            id="saved"
            title={strings.suggestionsSavedTab()}
            description={strings.suggestionsSavedCardDescription}
            count={savedCount}
            selected={tab === 'saved'}
            showCount={capture.hasSnapshot && !privateMode}
            onPress={() => setTab('saved')}
          />
        </Stack>

        {capture.loading && !capture.hasSnapshot ? (
          <AppText color="secondary">{strings.loading}</AppText>
        ) : null}
        {capture.error ? (
          <Stack space="sm">
            <AppText color="secondary">
              {capture.hasSnapshot ? strings.refreshError : strings.loadError}
            </AppText>
            <AppButton variant="secondary" onPress={() => void capture.onRetry()}>
              {strings.retry}
            </AppButton>
          </Stack>
        ) : null}

        {privateMode ? (
          <AppCard variant="secondary" paddingSize="md">
            <AppText variant="bodySmall" color="secondary">
              {strings.suggestionsHiddenInPrivateMode}
            </AppText>
          </AppCard>
        ) : capture.hasSnapshot && tab === 'review' ? (
          <ReviewSuggestions capture={capture} reviewCount={reviewCount} />
        ) : capture.hasSnapshot ? (
          <SavedCaptureDefaults capture={capture} savedCount={savedCount} />
        ) : null}
      </Stack>
    </SettingsLayout>
  );
}

function SuggestionsSectionCard({
  id,
  title,
  description,
  count,
  selected,
  showCount,
  onPress,
}: {
  id: SuggestionsTab;
  title: string;
  description: string;
  count: number;
  selected: boolean;
  showCount: boolean;
  onPress: () => void;
}) {
  const accessibilityLabel = showCount
    ? `${title}, ${count}. ${description}`
    : `${title}. ${description}`;

  return (
    <PressScaleTouchable
      haptic="selection"
      pressScale="subtle"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      testID={`capture-suggestions-${id}-card`}
    >
      <AppCard variant={selected ? 'ghost' : 'outline'} paddingSize="md">
        <Stack space="xs">
          <Box flexDirection="row" alignItems="center" justifyContent="space-between" gap="sm">
            <AppText variant="body" weight="semibold">
              {title}
            </AppText>
            {showCount ? (
              <Badge variant={selected ? 'primary' : 'default'} size="sm">
                {count}
              </Badge>
            ) : null}
          </Box>
          <AppText variant="bodySmall" color="secondary">
            {description}
          </AppText>
        </Stack>
      </AppCard>
    </PressScaleTouchable>
  );
}

function ReviewSuggestions({
  capture,
  reviewCount,
}: {
  capture: TransactionCaptureViewModel;
  reviewCount: number;
}) {
  const [visibleDefaulted, setVisibleDefaulted] = useState(PAGE_SIZE);
  const [visibleCategory, setVisibleCategory] = useState(PAGE_SIZE);
  const [visibleDescription, setVisibleDescription] = useState(PAGE_SIZE);
  const hasHistoricalPatterns =
    capture.historicalCategorySuggestions.length + capture.mixedHistoricalCategoryPatterns.length >
    0;

  return (
    <Stack space="xl">
      {reviewCount === 0 ? (
        <AppCard variant="secondary" paddingSize="md">
          <Stack space="sm">
            <AppText variant="body" weight="semibold">
              {strings.suggestionsEmptyTitle}
            </AppText>
            <AppText variant="bodySmall" color="secondary">
              {strings.suggestionsEmptyDescription}
            </AppText>
          </Stack>
        </AppCard>
      ) : null}

      {capture.defaulted.length > 0 ? (
        <ListGroup variant="card" header={strings.defaultedHeader}>
          <ListRow title={strings.defaultedHint} tone="utility" wrap />
          {capture.defaulted.slice(0, visibleDefaulted).map(item => (
            <Fragment key={item.journalId}>
              <ListRow
                icon={Icon.Document}
                title={item.description || strings.privateDescription}
                subtitle={`${strings.reviewTransaction} · ${formatDate(item.journalDate)} · ${item.currentCategoryNames?.join(', ') || strings.defaultedReview}`}
                trailing={<MoneyText amount={item.totalAmount} currencyCode={item.currencyCode} />}
                onPress={() => AppNavigation.toJournalDetails(item.journalId)}
                wrap
              />
              {item.confirmCategoryKey && item.currentCategoryNames?.length ? (
                <AppButton
                  variant="secondary"
                  disabled={capture.busy || capture.loading}
                  onPress={() => void capture.onConfirmCategories(item)}
                >
                  {strings.confirmCurrentCategories(item.currentCategoryNames.join(', '))}
                </AppButton>
              ) : null}
            </Fragment>
          ))}
          {capture.defaulted.length > visibleDefaulted ? (
            <AppButton
              variant="ghost"
              onPress={() => setVisibleDefaulted(count => count + PAGE_SIZE)}
            >
              {strings.showMore}
            </AppButton>
          ) : null}
        </ListGroup>
      ) : null}

      {capture.categoryCandidates.length > 0 ? (
        <ListGroup variant="card" header={strings.categoryCandidatesHeader}>
          <ListRow title={strings.categoryCandidatesHint} tone="utility" wrap />
          {capture.categoryCandidates.slice(0, visibleCategory).map(item => (
            <Fragment key={item.journalId}>
              <ListRow
                icon={Icon.Document}
                title={item.description || strings.privateDescription}
                subtitle={`${strings.viewExample} · ${formatDate(item.journalDate)}${item.suggestedCategoryName ? ` · ${item.suggestedCategoryName}` : ''}`}
                trailing={<MoneyText amount={item.totalAmount} currencyCode={item.currencyCode} />}
                onPress={() => AppNavigation.toJournalDetails(item.journalId)}
                wrap
              />
              {!item.keepOpen && item.suggestedDefault && item.suggestedDefaultAccountName ? (
                <AppButton
                  variant="secondary"
                  disabled={capture.busy || capture.loading}
                  onPress={() => capture.onRememberCategory(item)}
                >
                  {strings.rememberCategory}
                </AppButton>
              ) : null}
              {item.merchantKey ? (
                <AppButton
                  variant="ghost"
                  disabled={capture.busy || capture.loading}
                  onPress={() => void capture.onSetMerchantOpen(item.merchantKey!, !item.keepOpen)}
                >
                  {item.keepOpen ? strings.allowMerchantSuggestions : strings.keepMerchantOpen}
                </AppButton>
              ) : null}
            </Fragment>
          ))}
          {capture.categoryCandidates.length > visibleCategory ? (
            <AppButton
              variant="ghost"
              onPress={() => setVisibleCategory(count => count + PAGE_SIZE)}
            >
              {strings.showMore}
            </AppButton>
          ) : null}
        </ListGroup>
      ) : null}

      {hasHistoricalPatterns ? (
        <ListGroup variant="card" header={strings.historicalPagesHeader}>
          {capture.historicalCategorySuggestions.length > 0 ? (
            <ListRow
              icon={Icon.MessageSquare}
              title={strings.historicalCategoryHeader}
              subtitle={strings.historicalCategoryPageDescription}
              trailing={
                <Badge variant="default" size="sm">
                  {capture.historicalCategorySuggestions.length}
                </Badge>
              }
              chevron
              onPress={AppNavigation.toCaptureHistorySuggestions}
              wrap
            />
          ) : null}
          {capture.mixedHistoricalCategoryPatterns.length > 0 ? (
            <ListRow
              icon={Icon.MessageSquare}
              title={strings.historicalMixedHeader}
              subtitle={strings.historicalMixedPageDescription}
              trailing={
                <Badge variant="warning" size="sm">
                  {capture.mixedHistoricalCategoryCount}
                </Badge>
              }
              chevron
              onPress={AppNavigation.toCaptureMixedSuggestions}
              wrap
            />
          ) : null}
        </ListGroup>
      ) : null}

      {capture.descriptionCandidates.length > 0 ? (
        <ListGroup variant="card" header={strings.descriptionCandidatesHeader}>
          <ListRow title={strings.descriptionCandidatesHint} tone="utility" wrap />
          {capture.descriptionCandidates.slice(0, visibleDescription).map(item => (
            <Fragment key={item.journalId}>
              <ListRow
                icon={Icon.Document}
                title={item.description || strings.privateDescription}
                subtitle={`${strings.viewExample} · ${formatDate(item.journalDate)}${item.merchantKey ? ` · ${item.merchantKey}` : ''}`}
                trailing={<MoneyText amount={item.totalAmount} currencyCode={item.currencyCode} />}
                onPress={() => AppNavigation.toJournalDetails(item.journalId)}
                wrap
              />
              {item.descriptionDefaultKey && item.description ? (
                <AppButton
                  variant="secondary"
                  disabled={capture.busy || capture.loading}
                  onPress={() =>
                    capture.onSetDescriptionDefault(item.descriptionDefaultKey!, item.description)
                  }
                >
                  {strings.rememberName}
                </AppButton>
              ) : null}
              {item.merchantKey ? (
                <AppButton
                  variant="ghost"
                  disabled={capture.busy || capture.loading}
                  onPress={() => void capture.onSetMerchantOpen(item.merchantKey!, true)}
                >
                  {strings.keepMerchantOpen}
                </AppButton>
              ) : null}
            </Fragment>
          ))}
          {capture.descriptionCandidates.length > visibleDescription ? (
            <AppButton
              variant="ghost"
              onPress={() => setVisibleDescription(count => count + PAGE_SIZE)}
            >
              {strings.showMore}
            </AppButton>
          ) : null}
        </ListGroup>
      ) : null}
    </Stack>
  );
}

function SavedCaptureDefaults({
  capture,
  savedCount,
}: {
  capture: TransactionCaptureViewModel;
  savedCount: number;
}) {
  if (savedCount === 0) {
    return (
      <AppCard variant="secondary" paddingSize="md">
        <Stack space="sm">
          <AppText variant="body" weight="semibold">
            {strings.savedSuggestionsEmptyTitle}
          </AppText>
          <AppText variant="bodySmall" color="secondary">
            {strings.savedSuggestionsEmptyDescription}
          </AppText>
        </Stack>
      </AppCard>
    );
  }

  return (
    <Stack space="xl">
      {capture.categoryDefaults.length > 0 ? (
        <ListGroup variant="card" header={strings.categoryDefaultsHeader}>
          <ListRow title={strings.categoryDefaultsHint} tone="utility" wrap />
          {capture.categoryDefaults.map(value => (
            <Fragment key={value.key}>
              <ListRow
                icon={Icon.Tag}
                title={`${value.merchant} · ${value.conflicted ? strings.categoryDefaultConflictTitle : value.categoryName}`}
                subtitle={strings.categoryDefaultDetails(
                  value.financialAccountName,
                  value.currencyCode,
                  value.kind,
                  value.paused,
                  value.available,
                )}
                wrap
              />
              {value.conflicted ? (
                <>
                  <ListRow title={strings.categoryDefaultConflictHint} tone="utility" wrap />
                  {value.categoryChoices.map(choice => (
                    <AppButton
                      key={`${value.key}:${choice.accountId}`}
                      variant="secondary"
                      disabled={!choice.available || capture.busy}
                      onPress={() =>
                        void capture.onResolveCategoryDefaultConflict(value.key, choice.accountId)
                      }
                    >
                      {strings.chooseCategoryDefault(choice.name)}
                    </AppButton>
                  ))}
                </>
              ) : null}
              <AppButton
                variant="secondary"
                disabled={capture.busy || capture.loading}
                onPress={() => void capture.onSetMerchantOpen(value.merchant, !value.paused)}
              >
                {value.paused ? strings.allowMerchantSuggestions : strings.keepMerchantOpen}
              </AppButton>
              <AppButton
                variant="ghost"
                disabled={capture.busy || capture.loading}
                onPress={() => void capture.onForgetCategory(value.key)}
              >
                {strings.forgetCategory}
              </AppButton>
            </Fragment>
          ))}
        </ListGroup>
      ) : null}

      {capture.descriptionDefaults.length > 0 ? (
        <ListGroup variant="card" header={strings.descriptionDefaultsHeader}>
          {capture.descriptionDefaults.map(value => (
            <Fragment key={value.key}>
              <ListRow
                icon={Icon.Document}
                title={value.description}
                subtitle={strings.descriptionDefaultDetails(
                  value.merchant ?? strings.unknownMerchant,
                  value.paused,
                )}
                trailing={
                  value.amount != null && value.currencyCode ? (
                    <MoneyText amount={value.amount} currencyCode={value.currencyCode} />
                  ) : undefined
                }
                wrap
              />
              {value.merchant ? (
                <AppButton
                  variant="secondary"
                  disabled={capture.busy || capture.loading}
                  onPress={() => void capture.onSetMerchantOpen(value.merchant!, !value.paused)}
                >
                  {value.paused ? strings.allowMerchantSuggestions : strings.keepMerchantOpen}
                </AppButton>
              ) : null}
              <AppButton
                variant="ghost"
                disabled={capture.busy || capture.loading}
                onPress={() => capture.onSetDescriptionDefault(value.key)}
              >
                {strings.forgetName}
              </AppButton>
            </Fragment>
          ))}
        </ListGroup>
      ) : null}
    </Stack>
  );
}

function CaptureSuggestionsScreen() {
  const capture = useTransactionCaptureViewModel({
    loadReviewItems: true,
    loadCategoryDefaults: true,
    loadHistoricalSuggestions: true,
  });
  return <CaptureSuggestionsView key={capture.workplaceId} capture={capture} />;
}

export default withPrivacyScope(CaptureSuggestionsScreen);
