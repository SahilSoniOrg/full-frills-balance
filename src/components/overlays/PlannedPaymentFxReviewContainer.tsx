import { AppButton, AppText } from '@/src/components/core';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { ExchangeRateCard } from '@/src/components/forms/ExchangeRateCard';
import { AccountInlineLabel } from '@/src/components/accounts/AccountInlineLabel';
import { ModalSurface } from './ModalSurface';
import { Spacing } from '@/src/constants';
import { CURRENCY_SYMBOLS } from '@/src/constants/currency-definitions';
import { plannedPaymentFormStrings as copy } from '@/src/constants/copy/domains/plannedPaymentFormStrings';
import { useAccount } from '@/src/hooks/useAccounts';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { usePlannedPaymentFx } from '@/src/hooks/usePlannedPaymentFx';
import { registerPlannedPaymentFxReviewListener } from '@/src/services/planned-payment/plannedPaymentFxReviewRequest';
import type {
  PlannedPaymentFxReview,
  PlannedPaymentFxReviewRequest,
} from '@/src/services/planned-payment/plannedPaymentFx';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

type Entry = {
  request: Readonly<PlannedPaymentFxReviewRequest>;
  finish: (review: PlannedPaymentFxReview | null) => void;
};

export function PlannedPaymentFxReviewContainer() {
  const [entry, setEntry] = useState<Entry | null>(null);
  const active = useRef<Entry | null>(null);
  useEffect(() => {
    const unregister = registerPlannedPaymentFxReviewListener((request, finish) => {
      active.current?.finish(null);
      const next = { request, finish };
      active.current = next;
      setEntry(next);
    });
    return () => {
      unregister();
      active.current?.finish(null);
      active.current = null;
    };
  }, []);
  if (!entry) return null;
  const close = (review: PlannedPaymentFxReview | null) => {
    active.current = null;
    setEntry(null);
    entry.finish(review);
  };
  return (
    <PlannedPaymentFxReviewSheet
      key={`${entry.request.plannedPaymentId}:${entry.request.occurrenceVersion}`}
      request={entry.request}
      onFinish={close}
    />
  );
}

export function PlannedPaymentFxReviewSheet({
  request,
  onFinish,
}: {
  request: Readonly<PlannedPaymentFxReviewRequest>;
  onFinish: (review: PlannedPaymentFxReview | null) => void;
}) {
  const [amount, setAmount] = useState(String(request.sourceAmount));
  const [destinationAmount, setDestinationAmount] = useState<string | undefined>(
    request.destinationAmount?.toString(),
  );
  const { precision: sourcePrecision } = useCurrencyPrecision(request.sourceCurrency);
  const { precision: destinationPrecision } = useCurrencyPrecision(request.destinationCurrency);
  const { account: sourceAccount } = useAccount(request.fromAccountId, request.workplaceId);
  const { account: destinationAccount } = useAccount(request.toAccountId, request.workplaceId);
  const { pair, refresh } = usePlannedPaymentFx(
    {
      amount,
      currencyCode: request.sourceCurrency,
      fxMode: 'manual',
      destinationAmount,
    },
    sourceAccount ?? undefined,
    destinationAccount ?? undefined,
    destinationPrecision,
    { source: request.sourceCurrency, dest: request.destinationCurrency },
  );
  const received =
    request.sourceCurrency === request.destinationCurrency ? Number(amount) : pair.convertedAmount;
  const destinationDraftValid =
    destinationAmount === undefined ||
    (Number.isFinite(Number(destinationAmount)) && Number(destinationAmount) > 0);
  const valid =
    destinationDraftValid &&
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0 &&
    received != null &&
    Number.isFinite(received) &&
    received > 0;
  return (
    <ModalSurface
      visible
      title={copy.reviewTitle}
      onClose={() => onFinish(null)}
      position="bottomSheet"
      fixedHeight={false}
      keyboardAvoiding
      closeTestID="planned-payment-review-close"
      footer={
        <AppButton
          disabled={!valid}
          testID="planned-payment-review-post"
          onPress={() => {
            if (valid && received != null)
              onFinish({ ...request, sourceAmount: Number(amount), destinationAmount: received });
          }}
        >
          {copy.postPayment}
        </AppButton>
      }
    >
      <View style={styles.content}>
        <AppText variant="body" weight="semibold">
          {request.name}
        </AppText>
        <AppText variant="caption" color="secondary">
          {copy.reviewDescription}
        </AppText>
        <AccountInlineLabel account={sourceAccount} placeholder={copy.from} showIcon />
        <CalculatorAmountInput
          variant="centered"
          label={`${copy.from} · ${request.sourceCurrency}`}
          value={amount}
          onChangeText={setAmount}
          currencySymbol={CURRENCY_SYMBOLS[request.sourceCurrency] ?? request.sourceCurrency}
          precision={sourcePrecision}
          testID="planned-payment-review-source-amount"
        />
        <AccountInlineLabel account={destinationAccount} placeholder={copy.to} showIcon />
        <ExchangeRateCard
          pair={pair}
          destLabel={copy.to}
          precision={destinationPrecision}
          onConvertedAmountDraftChange={setDestinationAmount}
          convertedAmountValue={destinationAmount}
          onResetToApiRate={() => {
            setDestinationAmount(undefined);
            refresh();
          }}
          containerStyle={styles.fx}
          testIDPrefix="planned-payment-review-fx"
        />
      </View>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md },
  fx: { marginHorizontal: 0 },
});
