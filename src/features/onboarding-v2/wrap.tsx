import { AppButton, AppCard, AppText, ListRow } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig, Spacing } from '@/src/constants';
import { ONBOARDING_V2_STRINGS as copy } from '@/src/constants/copy/domains/onboardingV2Strings';
import { Box, Stack } from '@/src/design-system';
import dayjs from 'dayjs';
import { ScrollView, StyleSheet } from 'react-native';
import { ConversationStep } from './conversationUi';
import {
  incomeItemName,
  paymentItemName,
  type CashClarityDraft,
  type OnboardingV2Step,
} from './draft';
import type { CashClarityProjection, ClarityBeat } from './projectCashClarityDraft';

export function ClarityScene({
  currency,
  projection,
  onContinue,
  onBack,
}: {
  readonly currency: string;
  readonly projection: CashClarityProjection;
  readonly onContinue: () => void;
  readonly onBack: () => void;
}) {
  const sparse = projection.ahead.length === 0 && projection.heldNow === 0;

  return (
    <ConversationStep
      title={copy.clarityTitle}
      subtitle={copy.overNextDays(projection.windowDays)}
      onPrimary={onContinue}
      onBack={onBack}
    >
      <Stack gap="md">
        <Stack gap="xs" align="center">
          <AppText variant="caption" color="secondary">
            {copy.safeToSpend}
          </AppText>
          <MoneyText
            amount={projection.safeToSpend}
            currencyCode={currency}
            formatStyle="compact"
            variant="heading"
            weight="semibold"
            testID="onboarding-v2-clarity-sts"
          />
        </Stack>
        {sparse ? (
          <AppText variant="body" color="secondary" style={styles.centered}>
            {projection.liquidNow === 0 ? copy.clarityNoCashYet : copy.clarityNothingPlanned}
          </AppText>
        ) : (
          <>
            <AppText variant="caption" color="secondary">
              {copy.clarityHowTitle}
            </AppText>
            <AppCard variant="outline" paddingSize="none">
              {projection.today.map(beat => (
                <AmountRow key={beat.key} beat={beat} currency={currency} />
              ))}
            </AppCard>
            {projection.ahead.length > 0 ? (
              <>
                <AppText variant="caption" color="secondary">
                  {copy.clarityAheadTitle}
                </AppText>
                <AppCard variant="outline" paddingSize="none">
                  {projection.ahead.map(beat => (
                    <AmountRow key={beat.key} beat={beat} currency={currency} />
                  ))}
                </AppCard>
              </>
            ) : null}
            <AppText variant="body" color="secondary">
              {projection.explanation}
            </AppText>
          </>
        )}
      </Stack>
    </ConversationStep>
  );
}

function AmountRow({ beat, currency }: { readonly beat: ClarityBeat; readonly currency: string }) {
  return (
    <ListRow
      title={beat.label}
      subtitle={beat.subtitle}
      trailing={
        <MoneyText
          amount={beat.amount}
          currencyCode={currency}
          formatStyle="compact"
          prefix={beat.sign}
          variant="body"
          weight={beat.emphasize ? 'semibold' : 'regular'}
        />
      }
    />
  );
}

export function ReviewScene({
  draft,
  projection,
  finishing,
  onEnter,
  onChange,
  onEdit,
  onBack,
}: {
  readonly draft: CashClarityDraft;
  readonly projection: CashClarityProjection;
  readonly finishing: boolean;
  readonly onEnter: () => void;
  readonly onChange: () => void;
  readonly onEdit: (step: OnboardingV2Step) => void;
  readonly onBack: () => void;
}) {
  const strings = AppConfig.strings.onboarding.review;

  return (
    <Box flex={1}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Stack space="xs" align="center" style={styles.reviewHeader}>
          <AppText variant="title" style={styles.centered}>
            {copy.reviewTitle}
          </AppText>
        </Stack>
        <AppCard variant="outline" paddingSize="none">
          <ListRow
            title={strings.profile}
            subtitle={draft.displayName ?? ''}
            onPress={() => onEdit('you')}
          />
          <ListRow
            title={strings.workplace}
            subtitle={draft.workplaceName}
            onPress={() => onEdit('workspace')}
          />
          <ListRow
            title={strings.currency}
            subtitle={draft.currency}
            onPress={() => onEdit('currency')}
          />
          {draft.accounts.length === 0 ? (
            <ListRow title={copy.addLater} onPress={() => onEdit('now')} />
          ) : (
            draft.accounts.map(account => (
              <ListRow
                key={account.id}
                title={account.name}
                subtitle={
                  account.kind === 'savings'
                    ? account.spendable === false
                      ? copy.savingsProtected
                      : copy.savingsSpendable
                    : account.kind === 'card' &&
                        account.cardPaymentAmount &&
                        account.cardPaymentDate
                      ? copy.cardPaymentReview(dayjs(account.cardPaymentDate).format('D MMM'))
                      : undefined
                }
                trailing={
                  <MoneyText
                    amount={account.balance}
                    currencyCode={draft.currency}
                    formatStyle="compact"
                  />
                }
                onPress={() => onEdit('now')}
              />
            ))
          )}
          {draft.income.kind === 'recurring' ? (
            draft.income.items.map(item => (
              <ListRow
                key={item.id}
                title={incomeItemName(item)}
                subtitle={dayjs(item.nextDate).format('D MMM')}
                trailing={
                  <MoneyText
                    amount={item.amount}
                    currencyCode={draft.currency}
                    formatStyle="compact"
                    prefix="+"
                  />
                }
                onPress={() => onEdit('next')}
              />
            ))
          ) : (
            <ListRow
              title={copy.reviewIncome}
              subtitle={copy.reviewNotAdded}
              onPress={() => onEdit('next')}
            />
          )}
          {draft.commitment.kind === 'payment' ? (
            draft.commitment.items.map(item => (
              <ListRow
                key={item.id}
                title={paymentItemName(item)}
                subtitle={dayjs(item.dueDate).format('D MMM')}
                trailing={
                  <MoneyText
                    amount={item.amount}
                    currencyCode={draft.currency}
                    formatStyle="compact"
                    prefix="-"
                  />
                }
                onPress={() => onEdit('protect')}
              />
            ))
          ) : (
            <ListRow
              title={copy.reviewPayments}
              subtitle={copy.reviewNotAdded}
              onPress={() => onEdit('protect')}
            />
          )}
          {draft.budget.kind === 'set' ? (
            draft.budget.items.map(item => (
              <ListRow
                key={item.id}
                title={item.name}
                trailing={
                  <MoneyText
                    amount={item.amount}
                    currencyCode={draft.currency}
                    formatStyle="compact"
                    prefix="-"
                  />
                }
                onPress={() => onEdit('reserve')}
              />
            ))
          ) : (
            <ListRow
              title={copy.reviewBuffer}
              subtitle={copy.reviewNotAdded}
              onPress={() => onEdit('reserve')}
            />
          )}
        </AppCard>
        <Stack gap="xs" align="center" paddingTop="lg">
          <AppText variant="caption" color="secondary">
            {copy.safeToSpend}
          </AppText>
          <MoneyText
            amount={projection.safeToSpend}
            currencyCode={draft.currency}
            formatStyle="compact"
            variant="heading"
            weight="semibold"
          />
        </Stack>
      </ScrollView>
      <Box background="background" borderTopWidth={1} borderColor="border" paddingTop="md">
        <Stack space="xs">
          <AppButton
            variant="primary"
            size="lg"
            onPress={onEnter}
            loading={finishing}
            disabled={finishing}
            testID="onboarding-finish-button"
          >
            {finishing ? copy.finishing : copy.enterDashboard}
          </AppButton>
          <AppButton variant="ghost" size="md" onPress={onChange} disabled={finishing}>
            {copy.changeSomething}
          </AppButton>
          <AppButton variant="ghost" size="md" onPress={onBack} disabled={finishing}>
            {copy.back}
          </AppButton>
        </Stack>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  centered: {
    textAlign: 'center',
  },
  reviewHeader: {
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
});
