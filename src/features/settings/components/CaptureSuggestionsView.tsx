import {
  AppButton,
  AppCard,
  AppSegmentedControl,
  AppText,
  Badge,
  ListGroup,
  ListRow,
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
    <SettingsLayout title={strings.suggestionsTitle} hideFooter>
      <Stack space="lg">
        <AppCard variant="secondary" paddingSize="md">
          <Stack space="sm">
            <AppText variant="bodySmall" color="secondary">
              {strings.suggestionsPageDescription}
            </AppText>
          </Stack>
        </AppCard>

        <AppSegmentedControl<SuggestionsTab>
          options={[
            {
              id: 'review',
              label: strings.suggestionsReviewTab(privateMode ? undefined : reviewCount),
            },
            {
              id: 'saved',
              label: strings.suggestionsSavedTab(privateMode ? undefined : savedCount),
            },
          ]}
          value={tab}
          onChange={setTab}
          flex
          testID="capture-suggestions-tabs"
        />

        {capture.loading ? <AppText color="secondary">{strings.loading}</AppText> : null}
        {capture.error ? (
          <Stack space="sm">
            <AppText color="secondary">{strings.loadError}</AppText>
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
        ) : capture.error || capture.loading ? null : tab === 'review' ? (
          <ReviewSuggestions capture={capture} reviewCount={reviewCount} />
        ) : (
          <SavedCaptureDefaults capture={capture} savedCount={savedCount} />
        )}
      </Stack>
    </SettingsLayout>
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
  const [visibleHistorical, setVisibleHistorical] = useState(PAGE_SIZE);
  const [visibleMixed, setVisibleMixed] = useState(PAGE_SIZE);
  const [visibleDescription, setVisibleDescription] = useState(PAGE_SIZE);
  const [visibleVariants, setVisibleVariants] = useState(PAGE_SIZE);
  const hasReviewSuggestions = reviewCount > 0;

  return (
    <Stack space="xl">
      {!hasReviewSuggestions ? (
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

      {capture.possibleMerchantMatches.length > 0 ? (
        <PossibleMerchantMatches
          capture={capture}
          visibleCount={visibleVariants}
          onShowMore={() => setVisibleVariants(count => count + PAGE_SIZE)}
        />
      ) : null}

      {capture.historicalCategorySuggestions.length > 0 ? (
        <ListGroup variant="card" header={strings.historicalCategoryHeader}>
          <ListRow title={strings.historicalCategoryHint} tone="utility" wrap />
          {capture.historicalCategorySuggestions.slice(0, visibleHistorical).map(pattern => {
            const category = pattern.categories[0];
            return (
              <Fragment key={pattern.key}>
                <ListRow
                  icon={Icon.MessageSquare}
                  title={pattern.merchant}
                  subtitle={strings.historicalCategoryDetails(
                    pattern.journalCount,
                    pattern.sourceCount,
                    pattern.financialAccountName,
                    pattern.currencyCode,
                    pattern.kind,
                  )}
                  trailing={
                    <Badge variant="default" size="sm">
                      {category.name}
                    </Badge>
                  }
                  chevron
                  onPress={() => {
                    const journalId = pattern.journalIds[0];
                    if (!journalId) return;
                    AppNavigation.toJournalEntry({ journalId, workplaceId: capture.workplaceId });
                  }}
                  wrap
                />
                <Box paddingHorizontal="md">
                  <AppButton
                    variant="secondary"
                    disabled={capture.busy || capture.loading}
                    onPress={() => capture.onRememberHistoricalCategory(pattern)}
                  >
                    {strings.historicalCategoryAction(category.name)}
                  </AppButton>
                  <AppButton
                    variant="ghost"
                    disabled={capture.busy || capture.loading}
                    onPress={() => void capture.onSetHistoricalMerchantsOpen(pattern, true)}
                  >
                    {strings.keepMerchantOpen}
                  </AppButton>
                </Box>
              </Fragment>
            );
          })}
          {capture.historicalCategorySuggestions.length > visibleHistorical ? (
            <AppButton
              variant="ghost"
              onPress={() => setVisibleHistorical(count => count + PAGE_SIZE)}
            >
              {strings.showMore}
            </AppButton>
          ) : null}
        </ListGroup>
      ) : null}

      {capture.mixedHistoricalCategoryPatterns.length > 0 ? (
        <ListGroup variant="card" header={strings.historicalMixedHeader}>
          <ListRow
            title={strings.historicalMixedHint(capture.mixedHistoricalCategoryCount)}
            tone="utility"
            wrap
          />
          {capture.mixedHistoricalCategoryPatterns.slice(0, visibleMixed).map(pattern => (
            <Fragment key={pattern.key}>
              <ListRow
                icon={Icon.MessageSquare}
                title={pattern.merchant}
                subtitle={strings.historicalCategoryDetails(
                  pattern.journalCount,
                  pattern.sourceCount,
                  pattern.financialAccountName,
                  pattern.currencyCode,
                  pattern.kind,
                )}
                trailing={
                  <Badge variant="warning" size="sm">
                    {strings.historicalMixedBadge}
                  </Badge>
                }
                chevron
                onPress={() => {
                  const journalId = pattern.journalIds[0];
                  if (!journalId) return;
                  AppNavigation.toJournalEntry({ journalId, workplaceId: capture.workplaceId });
                }}
                wrap
              />
              <ListRow
                title={strings.historicalCategoryBreakdown}
                subtitle={pattern.categories
                  .map(category => `${category.name} (${category.journalCount})`)
                  .join(' · ')}
                tone="utility"
                wrap
              />
              <Box paddingHorizontal="md">
                <AppButton
                  variant="ghost"
                  disabled={capture.busy || capture.loading}
                  onPress={() => void capture.onSetHistoricalMerchantsOpen(pattern, true)}
                >
                  {strings.keepMerchantOpen}
                </AppButton>
              </Box>
            </Fragment>
          ))}
          {capture.mixedHistoricalCategoryPatterns.length > visibleMixed ? (
            <AppButton variant="ghost" onPress={() => setVisibleMixed(count => count + PAGE_SIZE)}>
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
                subtitle={`${formatDate(item.journalDate)}${item.suggestedCategoryName ? ` · ${item.suggestedCategoryName}` : ''}`}
                trailing={<MoneyText amount={item.totalAmount} currencyCode={item.currencyCode} />}
                onPress={() =>
                  AppNavigation.toJournalEntry({
                    journalId: item.journalId,
                    workplaceId: capture.workplaceId,
                  })
                }
                wrap
              />
              {!item.keepOpen && item.suggestedDefault && item.suggestedDefaultAccountName ? (
                <AppButton variant="ghost" onPress={() => capture.onRememberCategory(item)}>
                  {strings.rememberCategory}
                </AppButton>
              ) : null}
              {item.merchantKey ? (
                <AppButton
                  variant="ghost"
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

      {capture.descriptionCandidates.length > 0 ? (
        <ListGroup variant="card" header={strings.descriptionCandidatesHeader}>
          <ListRow title={strings.descriptionCandidatesHint} tone="utility" wrap />
          {capture.descriptionCandidates.slice(0, visibleDescription).map(item => (
            <Fragment key={item.journalId}>
              <ListRow
                icon={Icon.Document}
                title={item.description || strings.privateDescription}
                subtitle={`${formatDate(item.journalDate)}${item.merchantKey ? ` · ${item.merchantKey}` : ''}`}
                trailing={<MoneyText amount={item.totalAmount} currencyCode={item.currencyCode} />}
                onPress={() =>
                  AppNavigation.toJournalEntry({
                    journalId: item.journalId,
                    workplaceId: capture.workplaceId,
                  })
                }
                wrap
              />
              {item.descriptionDefaultKey && item.description ? (
                <AppButton
                  variant="ghost"
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

      {capture.defaulted.length > 0 ? (
        <ListGroup variant="card" header={strings.defaultedHeader}>
          <ListRow title={strings.defaultedHint} tone="utility" wrap />
          {capture.defaulted.slice(0, visibleDefaulted).map(item => (
            <Fragment key={item.journalId}>
              <ListRow
                icon={Icon.Document}
                title={item.description || strings.privateDescription}
                subtitle={`${formatDate(item.journalDate)} · ${item.currentCategoryNames?.join(', ') || strings.defaultedReview}`}
                trailing={<MoneyText amount={item.totalAmount} currencyCode={item.currencyCode} />}
                onPress={() =>
                  AppNavigation.toJournalEntry({
                    journalId: item.journalId,
                    workplaceId: capture.workplaceId,
                  })
                }
                wrap
              />
              {item.confirmCategoryKey && item.currentCategoryNames?.length ? (
                <AppButton variant="ghost" onPress={() => void capture.onConfirmCategories(item)}>
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
    </Stack>
  );
}

function PossibleMerchantMatches({
  capture,
  visibleCount,
  onShowMore,
}: {
  capture: TransactionCaptureViewModel;
  visibleCount: number;
  onShowMore: () => void;
}) {
  return (
    <ListGroup
      variant="card"
      header={strings.historicalVariantCandidatesHeader(capture.possibleMerchantMatches.length)}
    >
      <ListRow title={strings.historicalVariantCandidatesHint} tone="utility" wrap />
      {capture.possibleMerchantMatches.slice(0, visibleCount).map(candidate => (
        <Fragment key={candidate.key}>
          <ListRow
            title={strings.historicalVariantPair(candidate.names.map(name => name.name))}
            tone="utility"
            wrap
          />
          {candidate.names.map(name => (
            <ListRow
              key={`${candidate.key}:${name.name}`}
              icon={Icon.MessageSquare}
              title={name.name}
              subtitle={strings.historicalNameLinkDetails(name.journalCount, name.sourceCount)}
              trailing={
                <Badge variant="default" size="sm">
                  {strings.reviewLink}
                </Badge>
              }
              onPress={() => {
                const journalId = name.journalIds[0];
                if (!journalId) return;
                AppNavigation.toJournalEntry({ journalId, workplaceId: capture.workplaceId });
              }}
              wrap
            />
          ))}
        </Fragment>
      ))}
      {capture.possibleMerchantMatches.length > visibleCount ? (
        <AppButton variant="ghost" onPress={onShowMore}>
          {strings.showMore}
        </AppButton>
      ) : null}
    </ListGroup>
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
              <AppButton variant="ghost" onPress={() => void capture.onForgetCategory(value.key)}>
                {strings.forgetCategory}
              </AppButton>
              <AppButton
                variant="ghost"
                onPress={() => void capture.onSetMerchantOpen(value.merchant, !value.paused)}
              >
                {value.paused ? strings.allowMerchantSuggestions : strings.keepMerchantOpen}
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
              <AppButton variant="ghost" onPress={() => capture.onSetDescriptionDefault(value.key)}>
                {strings.forgetName}
              </AppButton>
              {value.merchant ? (
                <AppButton
                  variant="ghost"
                  onPress={() => void capture.onSetMerchantOpen(value.merchant!, !value.paused)}
                >
                  {value.paused ? strings.allowMerchantSuggestions : strings.keepMerchantOpen}
                </AppButton>
              ) : null}
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
