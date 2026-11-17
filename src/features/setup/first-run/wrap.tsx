import { AppButton, AppCard, AppText, ColoredDot, Icon, IconButton } from '@/src/components/core';
import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { ChromeMotion, Typography, Spacing } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Inline, Stack } from '@/src/design-system';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import type { ComponentVariant } from '@/src/design-system/variants';
import { MotiView } from 'moti';
import { type ReactNode, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ConversationStep } from './conversationUi';
import { ClarityChart } from './clarityChart';
import { publishedDraftAccountId } from './mapToWorkplaceOutput';
import type { CashClarityDraft } from './draft';
import type { CashClarityProjection, ClarityBeat } from './projectCashClarityDraft';
import { useClaritySceneViewModel } from './useClaritySceneViewModel';
import { signPrefix, type FlowSign } from '@/src/domain/accounting/presentationPolicy';

function ClarityResultPanel({ children }: { readonly children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <>{children}</>;
  return (
    <MotiView
      from={{ opacity: 0, scale: ChromeMotion.panelFromScale }}
      animate={{ opacity: 1, scale: 1 }}
      transition={ChromeMotion.sheetSpring}
    >
      {children}
    </MotiView>
  );
}

export type ClarityOmission = {
  readonly id?: string;
  readonly label: string;
  readonly detail?: string;
};

export type ClarityEditAction = {
  readonly id?: string;
  readonly label: string;
  readonly onPress: () => void;
};

export type PublishedClarityOutcome = {
  readonly retryOpen: () => void;
  readonly error?: string | null;
};

export function ClarityScene({
  currency,
  draft,
  projection,
  hasUsableEstimate,
  isIncompleteEstimate = false,
  finishing,
  finishError,
  publishedOutcome,
  omissions,
  editActions,
  recovery,
  dependencyMessage,
  onEnter,
  onBack,
}: {
  readonly currency: string;
  readonly draft: CashClarityDraft;
  readonly projection: CashClarityProjection;
  readonly hasUsableEstimate?: boolean;
  readonly isIncompleteEstimate?: boolean;
  readonly finishing: boolean;
  readonly finishError?: string | null;
  readonly publishedOutcome?: PublishedClarityOutcome;
  readonly omissions?: readonly (string | ClarityOmission)[] | null;
  readonly editActions?: readonly ClarityEditAction[] | null;
  readonly recovery?: ReactNode;
  readonly dependencyMessage?: string | null;
  readonly onEnter: () => void;
  readonly onBack: () => void;
}) {
  const { theme } = useTheme();
  const [explanationVisible, setExplanationVisible] = useState(false);
  const { detailGroups, hasAnyInput, stsColor, todayBeats } = useClaritySceneViewModel(
    draft,
    projection,
  );
  const normalizedOmissions = (omissions ?? []).map((item, index) =>
    typeof item === 'string' ? { id: `omission-${index}`, label: item } : item,
  );
  const published = publishedOutcome !== undefined;
  const estimateAvailable = hasUsableEstimate ?? hasAnyInput;
  const resultStatus = !estimateAvailable
    ? copy.clarityUnknown
    : projection.safeToSpend < 0
      ? copy.clarityShortfall
      : projection.safeToSpend === 0
        ? copy.clarityZero
        : copy.safeToSpend;
  const includedAccountIds = new Set(
    draft.accounts.map(account => publishedDraftAccountId(draft, account)),
  );
  const unvaluedAccounts = (draft.preservedStarterAccounts ?? []).filter(
    account => !account.id || !includedAccountIds.has(account.id),
  );
  const preservedCategories = draft.preservedStarterCategories ?? [];
  const groupDots = {
    cash: theme.asset,
    income: theme.success,
    payments: theme.error,
    budgets: theme.warning,
  };

  return (
    <ConversationStep
      primaryLabel={
        finishing
          ? copy.finishing
          : published
            ? copy.retryOpen
            : normalizedOmissions.length > 0
              ? copy.finishWithoutDeferred
              : copy.enterDashboard
      }
      primaryTestID="onboarding-finish-button"
      onPrimary={published ? publishedOutcome.retryOpen : onEnter}
      primaryLoading={finishing}
      primaryDisabled={finishing}
      onBack={onBack}
      backDisabled={published || finishing}
      validationMessage={
        published
          ? (publishedOutcome.error ?? copy.savedCouldNotOpen)
          : (finishError ?? dependencyMessage)
      }
      recovery={published ? undefined : recovery}
      footer={
        normalizedOmissions.length > 0 && !published ? (
          <AppText variant="caption" color="secondary">
            {copy.deferredSectionsNotice(normalizedOmissions.map(item => item.label).join(', '))}
          </AppText>
        ) : null
      }
    >
      <Stack gap="lg">
        <ClarityResultPanel>
          <AppCard variant="ghost" padding="xl" testID="onboarding-clarity-result">
            <Stack gap="md">
              <Inline align="center" justify="space-between" gap="md">
                <Stack gap="xs" flex={1}>
                  <AppText variant="overline" color="secondary">
                    {resultStatus}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {copy.overNextDays(projection.windowDays)}
                  </AppText>
                </Stack>
                <IconButton
                  name={Icon.HelpCircle}
                  style={{ minWidth: 48, minHeight: 48 }}
                  variant="clear"
                  accessibilityLabel={copy.clarityExplainAction}
                  onPress={() => setExplanationVisible(true)}
                  testID="onboarding-clarity-info-button"
                />
              </Inline>
              {estimateAvailable ? (
                <MoneyText
                  amount={projection.safeToSpend}
                  currencyCode={currency}
                  formatStyle="sts"
                  variant="hero"
                  color={projection.safeToSpend < 0 ? 'error' : 'primary'}
                  fit={{
                    maxFontSize: Typography.roles.hero.fontSize,
                    minFontSize: Typography.sizes.xxxl + Spacing.xs,
                    lineHeightRatio: Typography.lineHeights.tight,
                  }}
                  testID="onboarding-clarity-sts"
                />
              ) : null}
              {isIncompleteEstimate ? (
                <AppText variant="caption" color="secondary">
                  {copy.estimateIncomplete}
                </AppText>
              ) : null}
            </Stack>
          </AppCard>
        </ClarityResultPanel>

        {unvaluedAccounts.length > 0 || preservedCategories.length > 0 ? (
          <Stack gap="sm" testID="onboarding-preserved-definitions">
            <AppText variant="subheading">{copy.preservedDefinitions}</AppText>
            {unvaluedAccounts.map(account => (
              <Stack key={account.id ?? account.name} gap="xs">
                <AppText variant="body">{account.name}</AppText>
                <AppText variant="caption" color="secondary">
                  {copy.balanceNotProvided}
                </AppText>
              </Stack>
            ))}
            {preservedCategories.length > 0 ? (
              <AppText variant="caption" color="secondary">
                {copy.preservedCategories}:{' '}
                {preservedCategories.map(category => category.name).join(', ')}
              </AppText>
            ) : null}
          </Stack>
        ) : null}

        {editActions && editActions.length > 0 ? (
          <Stack gap="md" testID="onboarding-clarity-edit-actions">
            <AppText variant="subheading">{copy.reviewSetup}</AppText>
            {editActions.map(action => {
              const groupKey =
                action.id === 'accounts' ? 'cash' : action.id === 'budget' ? 'budgets' : action.id;
              const group = detailGroups.find(item => item.key === groupKey);
              const label =
                action.id === 'accounts'
                  ? copy.stageNow
                  : action.id === 'income'
                    ? copy.expectedIncome
                    : action.id === 'payments'
                      ? copy.upcomingPayments
                      : copy.stageReserve;
              return (
                <Inline
                  key={action.id ?? action.label}
                  align="center"
                  justify="space-between"
                  gap="sm"
                >
                  <Stack flex={1} gap="xs">
                    <AppText variant="body">{label}</AppText>
                    {group ? (
                      <MoneyText
                        amount={group.amount}
                        currencyCode={currency}
                        formatStyle="compact"
                        variant="body"
                      />
                    ) : (
                      <AppText variant="caption" color="secondary">
                        {copy.notIncludedYet}
                      </AppText>
                    )}
                    {group && group.key !== 'cash'
                      ? group.rows.map(row => (
                          <AppText key={row.id} variant="caption" color="secondary">
                            {row.detail ? `${row.label} · ${row.detail}` : row.label}
                          </AppText>
                        ))
                      : null}
                  </Stack>
                  <AppButton
                    variant="ghost"
                    size="sm"
                    style={{ minHeight: 44, minWidth: 44 }}
                    onPress={action.onPress}
                    disabled={finishing || published}
                    accessibilityLabel={action.label}
                    testID={`onboarding-edit-${action.id ?? action.label}`}
                  >
                    {copy.editSetupSection}
                  </AppButton>
                </Inline>
              );
            })}
          </Stack>
        ) : null}

        {!estimateAvailable ? (
          <AppText variant="body" color="secondary" style={styles.proseCopy}>
            {copy.clarityNoCashYet}
          </AppText>
        ) : null}
      </Stack>
      <InfoSheet
        visible={explanationVisible}
        title={copy.clarityExplainTitle}
        onClose={() => setExplanationVisible(false)}
        accessibilityCloseLabel={copy.closeClarityExplanation}
        position="bottomSheet"
        maxHeightPercent={90}
        fixedHeight={false}
      >
        <Stack gap="lg">
          <AppText variant="body" color="secondary" style={styles.proseCopy}>
            {copy.clarityFooter}
          </AppText>
          {estimateAvailable ? (
            <Stack gap="sm">
              <AppText variant="subheading">{copy.clarityExplainAction}</AppText>
              <AppCard variant="secondary" padding="lg" testID="onboarding-clarity-formula">
                <ClarityFormula projection={projection} currency={currency} />
              </AppCard>
            </Stack>
          ) : null}

          {estimateAvailable && todayBeats.length > 0 ? (
            <ClarityBeatCard
              testID="onboarding-clarity-now"
              title={copy.stageNow}
              beats={todayBeats}
              currency={currency}
              stsColor={stsColor}
            />
          ) : null}
          {estimateAvailable && projection.ahead.length > 0 ? (
            <ClarityBeatCard
              testID="onboarding-clarity-next"
              title={copy.stageNext}
              beats={projection.ahead}
              currency={currency}
              stsColor={stsColor}
            />
          ) : null}

          {estimateAvailable ? (
            <ClarityChart
              points={projection.chart}
              safeToSpend={projection.safeToSpend}
              currency={currency}
            />
          ) : null}
          {hasAnyInput ? (
            <Stack gap="lg">
              {detailGroups.map(group => (
                <ClarityGroup
                  key={group.key}
                  stage={group.stage}
                  tint={group.tint}
                  dot={groupDots[group.key]}
                  amount={group.amount}
                  currency={currency}
                  sign={group.sign}
                >
                  {group.rows.map(row =>
                    row.kind === 'label' ? (
                      <ClarityLabelRow key={row.id} label={row.label} detail={row.detail} />
                    ) : (
                      <ClarityFigure
                        key={row.id}
                        amount={row.amount}
                        currency={currency}
                        sign={row.sign}
                        tint={group.tint}
                        label={row.label}
                        detail={row.detail}
                      />
                    ),
                  )}
                </ClarityGroup>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </InfoSheet>
    </ConversationStep>
  );
}

function ClarityBeatCard({
  testID,
  title,
  beats,
  currency,
  stsColor,
}: {
  readonly testID: string;
  readonly title: string;
  readonly beats: readonly ClarityBeat[];
  readonly currency: string;
  readonly stsColor: ComponentVariant;
}) {
  return (
    <AppCard variant="outline" padding="lg" testID={testID}>
      <Stack gap="md">
        <AppText variant="subheading">{title}</AppText>
        <Stack gap="md">
          {beats.map(beat => (
            <ClarityBeatRow key={beat.key} beat={beat} currency={currency} stsColor={stsColor} />
          ))}
        </Stack>
      </Stack>
    </AppCard>
  );
}

function ClarityBeatRow({
  beat,
  currency,
  stsColor,
}: {
  readonly beat: ClarityBeat;
  readonly currency: string;
  readonly stsColor: ComponentVariant;
}) {
  const tint: ComponentVariant =
    beat.key === 'room' || beat.key === 'sts'
      ? stsColor
      : beat.key === 'held'
        ? 'warning'
        : beat.sign === 1
          ? 'income'
          : beat.sign === -1
            ? 'expense'
            : 'primary';

  return (
    <Inline align="center" justify="space-between" gap="md">
      <Stack gap="xs" flex={1}>
        <AppText
          variant={beat.emphasize ? 'subheading' : 'body'}
          color={beat.emphasize ? tint : 'primary'}
        >
          {beat.label}
        </AppText>
        {beat.subtitle ? (
          <AppText variant="caption" color="secondary">
            {beat.subtitle}
          </AppText>
        ) : null}
      </Stack>
      <MoneyText
        amount={beat.amount}
        currencyCode={currency}
        formatStyle="compact"
        prefix={signPrefix(beat.sign ?? 0) || undefined}
        variant={beat.emphasize ? 'subheading' : 'body'}
        color={tint}
      />
    </Inline>
  );
}

function ClarityFormula({
  projection,
  currency,
}: {
  readonly projection: CashClarityProjection;
  readonly currency: string;
}) {
  return (
    <Stack gap="xs">
      <AppText variant="caption" color="secondary" testID="onboarding-clarity-calculation">
        {copy.clarityCalculation}
      </AppText>
      <Inline justify="space-between" gap="md">
        <AppText variant="caption" color="secondary">
          {copy.cashYouHave}
        </AppText>
        <MoneyText
          amount={projection.liquidNow}
          currencyCode={currency}
          formatStyle="compact"
          variant="caption"
        />
      </Inline>
      <Inline justify="space-between" gap="md">
        <AppText variant="caption" color="secondary">
          {copy.expectedIncome}
        </AppText>
        <MoneyText
          amount={projection.expectedIncomeInWindow}
          currencyCode={currency}
          formatStyle="compact"
          prefix={signPrefix(1)}
          variant="caption"
        />
      </Inline>
      <Inline justify="space-between" gap="md">
        <AppText variant="caption" color="secondary">
          {copy.plannedPayment}
        </AppText>
        <MoneyText
          amount={projection.plannedOutflowInWindow}
          currencyCode={currency}
          formatStyle="compact"
          prefix={signPrefix(-1)}
          variant="caption"
        />
      </Inline>
      <Inline justify="space-between" gap="md">
        <AppText variant="caption" color="secondary">
          {copy.everydayBuffer}
        </AppText>
        <MoneyText
          amount={projection.budgetReserveInWindow}
          currencyCode={currency}
          formatStyle="compact"
          prefix={signPrefix(-1)}
          variant="caption"
        />
      </Inline>
    </Stack>
  );
}

function ClarityGroup({
  stage,
  tint,
  dot,
  amount,
  currency,
  sign,
  children,
}: {
  readonly stage: string;
  readonly tint: ComponentVariant;
  readonly dot: string;
  readonly amount: number;
  readonly currency: string;
  readonly sign?: FlowSign;
  readonly children: ReactNode;
}) {
  return (
    <Stack gap="xs">
      <Inline align="center" justify="space-between" gap="md">
        <Inline align="center" gap="sm" style={styles.figureCopy}>
          <ColoredDot color={dot} size={10} />
          <AppText variant="subheading" color={tint} weight="semibold">
            {stage}
          </AppText>
        </Inline>
        <MoneyText
          amount={amount}
          currencyCode={currency}
          formatStyle="compact"
          prefix={signPrefix(sign ?? 0) || undefined}
          variant="subheading"
          color={tint}
        />
      </Inline>
      <Stack gap="xs" paddingLeft="lg">
        {children}
      </Stack>
    </Stack>
  );
}

function ClarityLabelRow({
  label,
  detail,
  children,
}: {
  readonly label: string;
  readonly detail?: string;
  readonly children?: ReactNode;
}) {
  return (
    <Inline align="center" justify="space-between" gap="md">
      <AppText variant="caption" color="secondary" style={styles.figureCopy}>
        {detail ? `${label} · ${detail}` : label}
      </AppText>
      {children}
    </Inline>
  );
}

function ClarityFigure({
  amount,
  currency,
  sign,
  tint,
  label,
  detail,
}: {
  readonly amount: number;
  readonly currency: string;
  readonly sign?: FlowSign;
  readonly tint: ComponentVariant;
  readonly label: string;
  readonly detail: string;
}) {
  return (
    <ClarityLabelRow label={label} detail={detail}>
      <MoneyText
        amount={amount}
        currencyCode={currency}
        formatStyle="compact"
        prefix={signPrefix(sign ?? 0) || undefined}
        variant="caption"
        color={tint}
      />
    </ClarityLabelRow>
  );
}

const styles = StyleSheet.create({
  proseCopy: {
    textAlign: 'left',
    lineHeight: Typography.sizes.base * Typography.lineHeights.normal,
  },
  figureCopy: {
    flex: 1,
    minWidth: 0,
  },
});
