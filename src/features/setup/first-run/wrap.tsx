import { AppCard, AppText, ColoredDot, Icon, IconButton } from '@/src/components/core';
import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { ChromeMotion, Typography, Spacing } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Inline, Stack } from '@/src/design-system';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import type { ComponentVariant } from '@/src/utils/style-helpers';
import { MotiView } from 'moti';
import { type ReactNode, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ConversationStep } from './conversationUi';
import { ClarityChart } from './clarityChart';
import type { CashClarityDraft } from './draft';
import type { CashClarityProjection, ClarityBeat } from './projectCashClarityDraft';
import { useClaritySceneViewModel } from './useClaritySceneViewModel';

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

export function ClarityScene({
  currency,
  draft,
  projection,
  finishing,
  finishError,
  onEnter,
  onBack,
}: {
  readonly currency: string;
  readonly draft: CashClarityDraft;
  readonly projection: CashClarityProjection;
  readonly finishing: boolean;
  readonly finishError?: string | null;
  readonly onEnter: () => void;
  readonly onBack: () => void;
}) {
  const { theme } = useTheme();
  const [explanationVisible, setExplanationVisible] = useState(false);
  const { detailGroups, hasAnyInput, stsColor, todayBeats } = useClaritySceneViewModel(
    draft,
    projection,
  );
  const groupDots = {
    cash: theme.asset,
    income: theme.success,
    payments: theme.error,
    budgets: theme.warning,
  };

  return (
    <ConversationStep
      primaryLabel={finishing ? copy.finishing : copy.enterDashboard}
      primaryTestID="onboarding-finish-button"
      onPrimary={onEnter}
      primaryLoading={finishing}
      primaryDisabled={finishing}
      onBack={onBack}
    >
      <Stack gap="lg">
        {finishError ? (
          <AppText variant="body" color="error" accessibilityRole="alert">
            {finishError}
          </AppText>
        ) : null}
        <ClarityResultPanel>
          <AppCard
            variant={projection.safeToSpend > 0 ? 'ghost' : 'outline'}
            paddingSize="lg"
            testID="onboarding-clarity-result"
          >
            <Stack gap="md">
              <Inline align="center" justify="space-between" gap="md">
                <Stack gap="xs" flex={1}>
                  <AppText variant="overline" color="secondary">
                    {copy.safeToSpend}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {copy.overNextDays(projection.windowDays)}
                  </AppText>
                </Stack>
                <IconButton
                  name={Icon.HelpCircle}
                  variant="clear"
                  accessibilityLabel={copy.clarityExplainAction}
                  onPress={() => setExplanationVisible(true)}
                  testID="onboarding-clarity-info-button"
                />
              </Inline>
              <MoneyText
                amount={projection.safeToSpend}
                currencyCode={currency}
                formatStyle="compact"
                variant="hero"
                color={stsColor}
                fit={{
                  maxFontSize: Typography.roles.hero.fontSize,
                  minFontSize: Typography.sizes.xxxl + Spacing.xs,
                  lineHeightRatio: Typography.lineHeights.tight,
                }}
                testID="onboarding-clarity-sts"
              />
              <AppText variant="body" color="secondary" style={styles.proseCopy}>
                {copy.clarityDefinition}
              </AppText>
            </Stack>
          </AppCard>
        </ClarityResultPanel>

        <Stack gap="sm">
          <AppText variant="subheading">{copy.clarityExplainAction}</AppText>
          <AppCard variant="secondary" paddingSize="md" testID="onboarding-clarity-formula">
            <ClarityFormula projection={projection} currency={currency} />
          </AppCard>
        </Stack>

        {todayBeats.length > 0 ? (
          <ClarityBeatCard
            testID="onboarding-clarity-now"
            title={copy.stageNow}
            beats={todayBeats}
            currency={currency}
            stsColor={stsColor}
          />
        ) : null}
        {projection.ahead.length > 0 ? (
          <ClarityBeatCard
            testID="onboarding-clarity-next"
            title={copy.stageNext}
            beats={projection.ahead}
            currency={currency}
            stsColor={stsColor}
          />
        ) : null}

        {!hasAnyInput ? (
          <AppText variant="body" color="secondary" style={styles.proseCopy}>
            {copy.clarityNoCashYet}
          </AppText>
        ) : null}
      </Stack>
      <InfoSheet
        visible={explanationVisible}
        title={copy.clarityExplainTitle}
        onClose={() => setExplanationVisible(false)}
        accessibilityCloseLabel="Close Safe to Spend explanation"
        position="bottomSheet"
        maxHeightPercent={90}
        fixedHeight={false}
      >
        <Stack gap="lg">
          <AppText variant="body" color="secondary" style={styles.proseCopy}>
            {copy.clarityFooter}
          </AppText>
          <ClarityChart
            points={projection.chart}
            safeToSpend={projection.safeToSpend}
            currency={currency}
          />
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
    <AppCard variant="outline" paddingSize="md" testID={testID}>
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
        : beat.sign === '+'
          ? 'income'
          : beat.sign === '-'
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
        prefix={beat.sign}
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
          prefix="+"
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
          prefix="-"
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
          prefix="-"
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
  readonly sign?: '+' | '-';
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
          prefix={sign}
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
  readonly sign?: '+' | '-';
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
        prefix={sign}
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
