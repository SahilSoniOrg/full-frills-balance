import { AppText } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Spacing } from '@/src/constants';
import { ONBOARDING_STRINGS as copy } from '@/src/constants/copy/domains/onboardingStrings';
import { Box, Stack } from '@/src/design-system';
import type { CashClaritySetupDraft } from '../setupTypes';
import { onboardingStage, onboardingStepLabel } from './chrome';
import { ONBOARDING_PROGRESS_FLOW } from './flow';
import type { PreparedCashClarityInput } from './prepareEffectiveDraft';
import type { CashClarityProjection } from './projectCashClarityDraft';

export function ResumeSetupSummary({
  session,
  prepared,
  projection,
}: {
  readonly session: CashClaritySetupDraft;
  readonly prepared: PreparedCashClarityInput;
  readonly projection: CashClarityProjection;
}) {
  const { draft } = session;
  const stage = onboardingStage(session.step);
  const stageIndex = ONBOARDING_PROGRESS_FLOW.findIndex(entry => entry.step === session.step);
  const stepsAfterThis = ONBOARDING_PROGRESS_FLOW.slice(stageIndex < 0 ? 0 : stageIndex + 1).map(
    entry => entry.progressName,
  );
  const safeToSpendColor = !prepared.hasUsableEstimate
    ? 'secondary'
    : projection.safeToSpend > 0
      ? 'primary'
      : projection.safeToSpend < 0
        ? 'error'
        : 'secondary';
  const balanceColor = !prepared.hasUsableEstimate
    ? 'secondary'
    : projection.liquidNow > 0
      ? 'primary'
      : projection.liquidNow < 0
        ? 'error'
        : 'secondary';
  const savedCounts = [
    { label: copy.resumeAccountsLabel, count: draft.accounts.length },
    {
      label: copy.resumeIncomeLabel,
      count: draft.income.kind === 'recurring' ? draft.income.items.length : 0,
    },
    {
      label: copy.resumePaymentsLabel,
      count:
        (draft.commitment.kind === 'payment' ? draft.commitment.items.length : 0) +
        draft.accounts.filter(
          account => account.kind === 'card' && (account.cardPaymentAmount ?? 0) > 0,
        ).length,
    },
    {
      label: copy.resumeLimitsLabel,
      count: draft.budget.kind === 'set' ? draft.budget.items.length : 0,
    },
  ];

  return (
    <Box padding="lg" background="surface" borderColor="border" borderWidth={1} borderRadius="xxl">
      <Stack gap="md">
        <Stack direction="row" align="center" justify="space-between" gap="md">
          <AppText variant="subheading" weight="semibold">
            {onboardingStepLabel(session.step)}
          </AppText>
          <AppText variant="caption" color={stage ? 'primary' : 'secondary'} weight="medium">
            {stage ? copy.resumeStepProgress(stage.current, stage.total) : copy.resumeStarting}
          </AppText>
        </Stack>
        {stage ? (
          <Box
            accessibilityRole="progressbar"
            accessibilityLabel={stage.label}
            accessibilityValue={{ min: 1, max: stage.total, now: stage.current }}
            height={Spacing.xs}
            background="border"
            borderRadius="full"
            overflow="hidden"
          >
            <Box
              height="100%"
              width={`${(stage.current / stage.total) * 100}%`}
              background="primary"
              borderRadius="full"
            />
          </Box>
        ) : null}

        <Box height={1} background="border" />

        <Stack gap="xs">
          <AppText variant="caption" color="secondary">
            {copy.safeToSpend}
          </AppText>
          {prepared.hasUsableEstimate ? (
            <MoneyText
              amount={projection.safeToSpend}
              currencyCode={draft.currency}
              formatStyle="sts"
              variant="subheading"
              color={safeToSpendColor}
              testID="onboarding-resume-safe-to-spend"
            />
          ) : (
            <AppText variant="body" color="secondary">
              {copy.clarityUnknown}
            </AppText>
          )}
          {prepared.hasUsableEstimate && prepared.isIncomplete ? (
            <AppText variant="caption" color="secondary">
              {copy.estimateIncomplete}
            </AppText>
          ) : null}
          <Stack direction="row" align="center" justify="space-between" gap="md">
            <AppText variant="caption" color="secondary">
              {copy.resumeSpendableBalances}
            </AppText>
            {prepared.hasUsableEstimate ? (
              <MoneyText
                amount={projection.liquidNow}
                currencyCode={draft.currency}
                formatStyle="sts"
                variant="body"
                color={balanceColor}
              />
            ) : (
              <AppText variant="caption" color="secondary">
                {copy.resumeNoSpendableBalance}
              </AppText>
            )}
          </Stack>
        </Stack>

        <Box height={1} background="border" />

        <Stack gap="sm">
          <AppText variant="body" weight="semibold">
            {copy.resumeAddedTitle}
          </AppText>
          <Stack direction="row" gap="lg">
            {savedCounts.slice(0, 2).map(item => (
              <ResumeCount key={item.label} label={item.label} count={item.count} />
            ))}
          </Stack>
          <Stack direction="row" gap="lg">
            {savedCounts.slice(2).map(item => (
              <ResumeCount key={item.label} label={item.label} count={item.count} />
            ))}
          </Stack>
        </Stack>

        <Box height={1} background="border" />

        <Stack gap="xs">
          <AppText variant="caption" color="secondary">
            {copy.resumeAfterThis}
          </AppText>
          <AppText variant="body">
            {stepsAfterThis.length > 0 ? stepsAfterThis.join(' · ') : copy.resumeFinishSetup}
          </AppText>
        </Stack>
      </Stack>
    </Box>
  );
}

function ResumeCount({ label, count }: { readonly label: string; readonly count: number }) {
  return (
    <Stack flex={1} gap="xs">
      <AppText variant="subheading" weight="semibold">
        {count}
      </AppText>
      <AppText variant="caption" color="secondary">
        {label}
      </AppText>
    </Stack>
  );
}
