import { AppButton, AppCard, AppText, Badge, ListGroup, ListRow } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { Stack } from '@/src/design-system';
import { CaptureSearchField } from '@/src/features/settings/components/CaptureSearchField';
import type { TransactionCaptureViewModel } from '@/src/features/settings/hooks/useTransactionCaptureViewModel';
import { Icon } from '@/src/types/domainIcons';
import { Fragment, useState } from 'react';

const PAGE_SIZE = 20;

function ShowMore<T>({
  rows,
  visible,
  onPress,
}: {
  rows: readonly T[];
  visible: number;
  onPress: () => void;
}) {
  return rows.length > visible ? (
    <AppButton variant="ghost" onPress={onPress}>
      {strings.showMore}
    </AppButton>
  ) : null;
}

export function SavedCaptureDefaults({
  capture,
  savedCount,
}: {
  capture: TransactionCaptureViewModel;
  savedCount: number;
}) {
  const [search, setSearch] = useState('');
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const pausedWithoutRule = countUnrepresentedPausedMerchants(capture);
  const query = search.trim().toLocaleLowerCase();
  const matches = (fields: (string | number | undefined)[]) =>
    !query ||
    fields
      .filter(value => value != null)
      .join(' ')
      .toLocaleLowerCase()
      .includes(query);
  const categoryDefaults = capture.categoryDefaults
    .filter(value =>
      matches([
        value.merchant,
        value.categoryName,
        value.financialAccountName,
        value.currencyCode,
        value.kind,
        value.paused ? strings.paused : undefined,
        value.available ? undefined : strings.unavailable,
        value.conflicted ? strings.conflicted : undefined,
      ]),
    )
    .sort(
      (left, right) =>
        left.merchant.localeCompare(right.merchant) || left.key.localeCompare(right.key),
    );
  const descriptionDefaults = capture.descriptionDefaults
    .filter(value =>
      matches([
        value.description,
        value.merchant,
        value.amount,
        value.currencyCode,
        value.kind,
        value.paused ? strings.paused : undefined,
      ]),
    )
    .sort(
      (left, right) =>
        left.description.localeCompare(right.description) || left.key.localeCompare(right.key),
    );
  const visiblePausedMerchants = pausedWithoutRule.filter(merchant => matches([merchant]));
  const filteredSavedCount =
    categoryDefaults.length + descriptionDefaults.length + visiblePausedMerchants.length;
  if (savedCount === 0) {
    return (
      <AppCard variant="secondary" padding="lg">
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
    <Stack space="lg">
      <CaptureSearchField
        value={search}
        onChangeText={value => {
          setSearch(value);
          setVisibleCounts({});
        }}
        placeholder={strings.savedDefaultsSearchPlaceholder}
        accessibilityLabel={strings.savedDefaultsSearchPlaceholder}
        testID="capture-saved-defaults-search"
        clearTestID="capture-saved-defaults-clear-search"
        clearAccessibilityLabel={strings.clearSearch}
      />
      {filteredSavedCount === 0 ? (
        <AppCard variant="secondary" padding="lg">
          <AppText variant="bodySmall" color="secondary">
            {strings.matchingSearchNoResults}
          </AppText>
        </AppCard>
      ) : null}

      {categoryDefaults.length > 0 ? (
        <ListGroup
          variant="plain"
          header={strings.categoryDefaultsHeader}
          headerAccessory={
            <Badge variant="default" size="sm">
              {categoryDefaults.length}
            </Badge>
          }
        >
          <ListRow title={strings.categoryDefaultsHint} tone="utility" wrap />
          {categoryDefaults.slice(0, visibleCounts.categoryDefaults ?? PAGE_SIZE).map(value => (
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
                trailing={
                  value.conflicted ? (
                    <Badge variant="warning" size="sm">
                      {strings.conflicted}
                    </Badge>
                  ) : !value.available ? (
                    <Badge variant="warning" size="sm">
                      {strings.unavailable}
                    </Badge>
                  ) : value.paused ? (
                    <Badge variant="default" size="sm">
                      {strings.paused}
                    </Badge>
                  ) : undefined
                }
                wrap
              />
              {value.conflicted ? (
                <>
                  <ListRow title={strings.categoryDefaultConflictHint} tone="utility" wrap />
                  {value.categoryChoices.map(choice => (
                    <AppButton
                      key={`${value.key}:${choice.accountId}`}
                      variant="secondary"
                      disabled={!choice.available || capture.busy || capture.loading}
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
          <ShowMore
            rows={categoryDefaults}
            visible={visibleCounts.categoryDefaults ?? PAGE_SIZE}
            onPress={() =>
              setVisibleCounts(current => ({
                ...current,
                categoryDefaults: (current.categoryDefaults ?? PAGE_SIZE) + PAGE_SIZE,
              }))
            }
          />
        </ListGroup>
      ) : null}

      {descriptionDefaults.length > 0 ? (
        <ListGroup
          variant="plain"
          header={strings.descriptionDefaultsHeader}
          headerAccessory={
            <Badge variant="default" size="sm">
              {descriptionDefaults.length}
            </Badge>
          }
        >
          {descriptionDefaults
            .slice(0, visibleCounts.descriptionDefaults ?? PAGE_SIZE)
            .map(value => (
              <Fragment key={value.key}>
                <ListRow
                  icon={Icon.Document}
                  title={value.description}
                  subtitle={strings.descriptionDefaultDetails(
                    value.merchant ?? strings.unknownMerchant,
                    value.amount == null ? undefined : String(value.amount),
                    value.currencyCode,
                    value.kind ?? strings.unknownType,
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
          <ShowMore
            rows={descriptionDefaults}
            visible={visibleCounts.descriptionDefaults ?? PAGE_SIZE}
            onPress={() =>
              setVisibleCounts(current => ({
                ...current,
                descriptionDefaults: (current.descriptionDefaults ?? PAGE_SIZE) + PAGE_SIZE,
              }))
            }
          />
        </ListGroup>
      ) : null}

      {visiblePausedMerchants.length > 0 ? (
        <ListGroup
          variant="plain"
          header={strings.pausedMerchantsHeader}
          headerAccessory={
            <Badge variant="default" size="sm">
              {visiblePausedMerchants.length}
            </Badge>
          }
        >
          {visiblePausedMerchants
            .slice(0, visibleCounts.pausedMerchants ?? PAGE_SIZE)
            .map(merchant => (
              <Fragment key={merchant}>
                <ListRow
                  title={merchant}
                  subtitle={strings.merchantReviewPaused}
                  trailing={
                    <Badge variant="default" size="sm">
                      {strings.paused}
                    </Badge>
                  }
                  wrap
                />
                <AppButton
                  variant="secondary"
                  disabled={capture.busy || capture.loading}
                  onPress={() => void capture.onSetMerchantOpen(merchant, false)}
                >
                  {strings.allowMerchantSuggestions}
                </AppButton>
              </Fragment>
            ))}
          <ShowMore
            rows={visiblePausedMerchants}
            visible={visibleCounts.pausedMerchants ?? PAGE_SIZE}
            onPress={() =>
              setVisibleCounts(current => ({
                ...current,
                pausedMerchants: (current.pausedMerchants ?? PAGE_SIZE) + PAGE_SIZE,
              }))
            }
          />
        </ListGroup>
      ) : null}
    </Stack>
  );
}

export function countUnrepresentedPausedMerchants(capture: TransactionCaptureViewModel): string[] {
  const represented = new Set([
    ...capture.categoryDefaults.map(value => value.merchant.trim().toLowerCase()),
    ...capture.descriptionDefaults.flatMap(value =>
      value.merchant ? [value.merchant.trim().toLowerCase()] : [],
    ),
  ]);
  return capture.openCaptureMerchants.filter(merchant => !represented.has(merchant.toLowerCase()));
}
