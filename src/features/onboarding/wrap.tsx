import { AppText, ColoredDot } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Typography } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import type { ComponentVariant } from '@/src/utils/style-helpers';
import dayjs from 'dayjs';
import { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { ConversationStep } from './conversationUi';
import { ClarityChart } from './clarityChart';
import { incomeItemName, paymentItemName, type CashClarityDraft } from './draft';
import type { CashClarityProjection } from './projectCashClarityDraft';

export function ClarityScene({
  currency,
  draft,
  projection,
  finishing,
  onEnter,
  onBack,
}: {
  readonly currency: string;
  readonly draft: CashClarityDraft;
  readonly projection: CashClarityProjection;
  readonly finishing: boolean;
  readonly onEnter: () => void;
  readonly onBack: () => void;
}) {
  const { theme } = useTheme();
  const income = draft.income.kind === 'recurring' ? draft.income.items : [];
  const payments = draft.commitment.kind === 'payment' ? draft.commitment.items : [];
  const budgets = draft.budget.kind === 'set' ? draft.budget.items : [];
  const hasCash =
    projection.liquidNow > 0 || draft.accounts.some(account => account.kind !== 'card');
  const stsColor: ComponentVariant =
    projection.safeToSpend > 0 ? 'primary' : projection.safeToSpend < 0 ? 'error' : 'secondary';

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
        <Stack gap="xs">
          <AppText variant="caption" color="secondary" weight="bold" style={styles.stageLabel}>
            {copy.safeToSpend}
          </AppText>
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
          <AppText variant="caption" color="secondary">
            {copy.overNextDays(projection.windowDays)}
          </AppText>
          <AppText variant="body" color="secondary" style={styles.proseCopy}>
            {copy.clarityFooter}
          </AppText>
        </Stack>

        <ClarityChart
          points={projection.chart}
          safeToSpend={projection.safeToSpend}
          currency={currency}
        />

        {!(hasCash || income.length > 0 || payments.length > 0 || budgets.length > 0) ? (
          <AppText variant="body" color="secondary" style={styles.proseCopy}>
            {copy.clarityNoCashYet}
          </AppText>
        ) : (
          <Stack gap="lg">
            {hasCash ? (
              <ClarityGroup
                stage={copy.stageNow}
                tint="asset"
                dot={theme.asset}
                amount={projection.liquidNow}
                currency={currency}
              >
                <ClarityFigure label={copy.cashYouHave} />
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
                {income.map(item => (
                  <ClarityFigure
                    key={item.id}
                    amount={income.length > 1 ? item.amount : undefined}
                    currency={currency}
                    sign="+"
                    tint="income"
                    label={incomeItemName(item)}
                    detail={dayjs(item.nextDate).format('D MMM')}
                  />
                ))}
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
                {payments.map(item => (
                  <ClarityFigure
                    key={item.id}
                    amount={payments.length > 1 ? item.amount : undefined}
                    currency={currency}
                    sign="-"
                    tint="expense"
                    label={paymentItemName(item)}
                    detail={dayjs(item.dueDate).format('D MMM')}
                  />
                ))}
              </ClarityGroup>
            ) : null}
            {budgets.length > 0 ? (
              <ClarityGroup
                stage={copy.stageReserve}
                tint="warning"
                dot={theme.warning}
                amount={budgets.reduce((sum, item) => sum + item.amount, 0)}
                currency={currency}
              >
                {budgets.map(item => (
                  <ClarityFigure
                    key={item.id}
                    amount={budgets.length > 1 ? item.amount : undefined}
                    currency={currency}
                    tint="warning"
                    label={item.name}
                    detail={copy.monthly}
                  />
                ))}
              </ClarityGroup>
            ) : null}
          </Stack>
        )}
      </Stack>
    </ConversationStep>
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

function ClarityFigure({
  amount,
  currency,
  sign,
  tint,
  label,
  detail,
}: {
  readonly amount?: number;
  readonly currency?: string;
  readonly sign?: '+' | '-';
  readonly tint?: ComponentVariant;
  readonly label: string;
  readonly detail?: string;
}) {
  return (
    <Inline align="center" justify="space-between" gap="md">
      <AppText variant="caption" color="secondary" style={styles.figureCopy}>
        {detail ? `${label} · ${detail}` : label}
      </AppText>
      {amount != null && currency && tint ? (
        <MoneyText
          amount={amount}
          currencyCode={currency}
          formatStyle="compact"
          prefix={sign}
          variant="caption"
          color={tint}
        />
      ) : null}
    </Inline>
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
