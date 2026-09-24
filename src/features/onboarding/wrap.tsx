import { AppCard, AppText, ColoredDot, Icon, IconButton } from '@/src/components/core';
import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Typography } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import type { ComponentVariant } from '@/src/utils/style-helpers';
import dayjs from 'dayjs';
import { type ReactNode, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ConversationStep } from './conversationUi';
import { ClarityChart } from './clarityChart';
import { incomeItemName, paymentItemName, type CashClarityDraft } from './draft';
import type { CashClarityProjection, ClarityBeat } from './projectCashClarityDraft';

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
  const income = draft.income.kind === 'recurring' ? draft.income.items : [];
  const payments = draft.commitment.kind === 'payment' ? draft.commitment.items : [];
  const budgets = draft.budget.kind === 'set' ? draft.budget.items : [];
  const hasCash =
    projection.liquidNow > 0 || draft.accounts.some(account => account.kind !== 'card');
  const hasAnyInput = hasCash || income.length > 0 || payments.length > 0 || budgets.length > 0;
  const stsColor: ComponentVariant =
    projection.safeToSpend > 0 ? 'primary' : projection.safeToSpend < 0 ? 'error' : 'secondary';
  const todayBeats = projection.today.filter(beat => beat.key !== 'sts');

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
        <AppCard
          variant={projection.safeToSpend > 0 ? 'ghost' : 'outline'}
          paddingSize="lg"
          testID="onboarding-clarity-result"
        >
          <Stack gap="md">
            <Inline align="center" justify="space-between" gap="md">
              <Stack gap="xs" flex={1}>
                <AppText
                  variant="caption"
                  color="secondary"
                  weight="bold"
                  style={styles.stageLabel}
                >
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
              numberOfLines={1}
              adjustsFontSizeToFit
              testID="onboarding-clarity-sts"
            />
            <AppText variant="body" color="secondary" style={styles.proseCopy}>
              {copy.clarityDefinition}
            </AppText>
          </Stack>
        </AppCard>

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
              {hasCash ? (
                <ClarityGroup
                  stage={copy.stageNow}
                  tint="asset"
                  dot={theme.asset}
                  amount={projection.liquidNow}
                  currency={currency}
                >
                  <ClarityLabelRow label={copy.cashYouHave} />
                </ClarityGroup>
              ) : null}
              {income.length > 0 ? (
                <ClarityGroup
                  stage={copy.stageNext}
                  tint="income"
                  dot={theme.success}
                  amount={income.reduce((sum, item) => sum + item.amount, 0)}
                  currency={currency}
                  sign="+"
                >
                  {income.map(item =>
                    income.length > 1 ? (
                      <ClarityFigure
                        key={item.id}
                        amount={item.amount}
                        currency={currency}
                        sign="+"
                        tint="income"
                        label={incomeItemName(item)}
                        detail={dayjs(item.nextDate).format('D MMM')}
                      />
                    ) : (
                      <ClarityLabelRow
                        key={item.id}
                        label={incomeItemName(item)}
                        detail={dayjs(item.nextDate).format('D MMM')}
                      />
                    ),
                  )}
                </ClarityGroup>
              ) : null}
              {payments.length > 0 ? (
                <ClarityGroup
                  stage={copy.stageProtect}
                  tint="expense"
                  dot={theme.error}
                  amount={payments.reduce((sum, item) => sum + item.amount, 0)}
                  currency={currency}
                  sign="-"
                >
                  {payments.map(item =>
                    payments.length > 1 ? (
                      <ClarityFigure
                        key={item.id}
                        amount={item.amount}
                        currency={currency}
                        sign="-"
                        tint="expense"
                        label={paymentItemName(item)}
                        detail={dayjs(item.dueDate).format('D MMM')}
                      />
                    ) : (
                      <ClarityLabelRow
                        key={item.id}
                        label={paymentItemName(item)}
                        detail={dayjs(item.dueDate).format('D MMM')}
                      />
                    ),
                  )}
                </ClarityGroup>
              ) : null}
              {budgets.length > 0 ? (
                <ClarityGroup
                  stage={copy.stageReserve}
                  tint="warning"
                  dot={theme.warning}
                  amount={projection.budgetReserveInWindow}
                  currency={currency}
                >
                  {budgets.map(item =>
                    budgets.length > 1 ? (
                      <ClarityFigure
                        key={item.id}
                        amount={item.amount}
                        currency={currency}
                        tint="warning"
                        label={item.name}
                        detail={copy.monthly}
                      />
                    ) : (
                      <ClarityLabelRow key={item.id} label={item.name} detail={copy.monthly} />
                    ),
                  )}
                </ClarityGroup>
              ) : null}
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
  stageLabel: {
    letterSpacing: Typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  figureCopy: {
    flex: 1,
    minWidth: 0,
  },
});
