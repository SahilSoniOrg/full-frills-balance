import { AppInput, AppText } from '@/src/components/core';
import { InfoSheet } from '@/src/components/overlays/InfoSheet';
import { AppConfig, Spacing } from '@/src/constants';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import {
  clearIncompleteFxDetailsListener,
  setIncompleteFxDetailsListener,
  type IncompleteFxContext,
  type IncompleteFxDetailsRequest,
} from '@/src/utils/incompleteFxDetails';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

const MAX_VISIBLE_MISSING_RATES = 24;
const EMPTY_BALANCES: NonNullable<IncompleteFxDetailsRequest['unvaluedStartingBalances']> = [];

const TITLE_BY_CONTEXT: Record<IncompleteFxContext, string> = {
  'safe-to-spend': AppConfig.strings.common.incompleteFx.safeToSpendDetailsTitle,
  budget: AppConfig.strings.common.incompleteFx.budgetDetailsTitle,
  reports: AppConfig.strings.common.incompleteFx.reportsDetailsTitle,
  'cash-flow': AppConfig.strings.common.incompleteFx.cashFlowDetailsTitle,
};

type CurrentRatePair = { fromCurrency: string; toCurrency: string };

function pairKey(pair: CurrentRatePair): string {
  return `${pair.fromCurrency}->${pair.toCurrency}`;
}

function uniqueCurrentRatePairs(
  balances: NonNullable<IncompleteFxDetailsRequest['unvaluedStartingBalances']>,
): CurrentRatePair[] {
  const pairs = new Map<string, CurrentRatePair>();
  for (const balance of balances) {
    const pair = {
      fromCurrency: balance.fromCurrency.trim().toUpperCase(),
      toCurrency: balance.toCurrency.trim().toUpperCase(),
    };
    if (pair.fromCurrency && pair.toCurrency && pair.fromCurrency !== pair.toCurrency) {
      pairs.set(pairKey(pair), pair);
    }
  }
  return [...pairs.values()];
}

function parseRateInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized || !/^\d*\.?\d*$/.test(normalized)) return null;
  const rate = Number(normalized);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function IncompleteFxDetailsContainer() {
  const requestSequence = useRef(0);
  const [entry, setEntry] = useState<{
    id: number;
    request: IncompleteFxDetailsRequest;
  } | null>(null);

  useEffect(() => {
    setIncompleteFxDetailsListener(request => {
      requestSequence.current += 1;
      setEntry({ id: requestSequence.current, request });
    });
    return clearIncompleteFxDetailsListener;
  }, []);

  if (!entry) return null;

  return (
    <IncompleteFxDetailsSheet
      key={entry.id}
      request={entry.request}
      onClose={() => setEntry(null)}
    />
  );
}

function IncompleteFxDetailsSheet({
  request,
  onClose,
}: {
  request: IncompleteFxDetailsRequest;
  onClose: () => void;
}) {
  const copy = AppConfig.strings.common.incompleteFx;
  const balances = request.unvaluedStartingBalances ?? EMPTY_BALANCES;
  const missingRateQuotes = request.missingRateQuotes ?? [];
  const visibleMissingRateQuotes = missingRateQuotes.slice(0, MAX_VISIBLE_MISSING_RATES);
  const currentRatePairs = useMemo(() => uniqueCurrentRatePairs(balances), [balances]);
  const [unresolvedPairs, setUnresolvedPairs] = useState<CurrentRatePair[] | null>(null);
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const actionableBalances =
    request.context === 'safe-to-spend' && balances.length > 0 && currentRatePairs.length > 0;
  const pairsToResolve = unresolvedPairs ?? currentRatePairs;
  const unresolvedKeys = useMemo(() => new Set(pairsToResolve.map(pairKey)), [pairsToResolve]);
  const visibleBalances =
    unresolvedPairs === null
      ? balances
      : balances.filter(balance =>
          unresolvedKeys.has(
            pairKey({
              fromCurrency: balance.fromCurrency.trim().toUpperCase(),
              toCurrency: balance.toCurrency.trim().toUpperCase(),
            }),
          ),
        );
  const manualRatesReady =
    pairsToResolve.length > 0 &&
    pairsToResolve.every(pair => parseRateInput(rateInputs[pairKey(pair)] ?? '') !== null);

  const handleRefreshRates = async () => {
    if (!actionableBalances || pairsToResolve.length === 0 || isRefreshing) return;
    setIsRefreshing(true);
    setRefreshMessage(null);
    setSaveError(false);
    try {
      const results = await Promise.all(
        pairsToResolve.map(async pair => {
          try {
            const rate = await exchangeRateService.getRequiredRate(
              pair.fromCurrency,
              pair.toCurrency,
              true,
            );
            return { pair, available: rate !== null && Number.isFinite(rate) && rate > 0 };
          } catch {
            return { pair, available: false };
          }
        }),
      );
      const remaining = results.filter(result => !result.available).map(result => result.pair);
      const updatedCount = results.length - remaining.length;
      if (remaining.length === 0) {
        onClose();
        return;
      }
      setUnresolvedPairs(remaining);
      setRefreshMessage(copy.currentRatesRefreshResult(updatedCount, remaining.length));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveManualRates = async () => {
    if (!manualRatesReady || isSaving) return;
    setIsSaving(true);
    setSaveError(false);
    try {
      await Promise.all(
        pairsToResolve.map(pair =>
          exchangeRateService.setManualSpotRate(
            pair.fromCurrency,
            pair.toCurrency,
            parseRateInput(rateInputs[pairKey(pair)])!,
          ),
        ),
      );
      onClose();
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  };

  const primaryAction = actionableBalances
    ? unresolvedPairs === null
      ? {
          label: isRefreshing ? copy.refreshingCurrentRates : copy.refreshCurrentRates,
          onPress: handleRefreshRates,
          disabled: isRefreshing,
        }
      : {
          label: isSaving ? copy.savingManualRates : copy.saveManualRates,
          onPress: handleSaveManualRates,
          disabled: !manualRatesReady || isSaving,
        }
    : undefined;
  const secondaryAction =
    actionableBalances && unresolvedPairs !== null
      ? {
          label: isRefreshing ? copy.refreshingCurrentRates : copy.refreshCurrentRates,
          onPress: handleRefreshRates,
          disabled: isRefreshing || isSaving,
        }
      : undefined;

  return (
    <InfoSheet
      visible
      title={TITLE_BY_CONTEXT[request.context] ?? copy.detailsTitle}
      onClose={onClose}
      accessibilityCloseLabel="Close incomplete figures details"
      useNativeModal={false}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
    >
      <View style={{ gap: Spacing.lg }}>
        <AppText variant="body" color="secondary">
          {request.context === 'safe-to-spend'
            ? copy.detailsIntro(request.currencyCode)
            : request.context === 'budget'
              ? copy.budgetDetailsIntro
              : copy.reportsDetailsIntro}
        </AppText>
        {visibleBalances.length > 0 ? (
          <View style={{ gap: Spacing.md }}>
            <AppText variant="subheading" weight="bold">
              {copy.excludedStartingBalancesTitle}
            </AppText>
            {visibleBalances.map(balance => (
              <View key={balance.accountId} style={{ gap: Spacing.xs }}>
                <AppText variant="body" weight="medium">
                  {copy.excludedStartingBalance(balance.accountName, balance.amountLabel)}
                </AppText>
                <AppText variant="caption" color="secondary">
                  {copy.missingCurrentExchangeRate(balance.fromCurrency, balance.toCurrency)}
                </AppText>
              </View>
            ))}
          </View>
        ) : missingRateQuotes.length > 0 ? (
          <View style={{ gap: Spacing.md }}>
            <AppText variant="subheading" weight="bold">
              {copy.missingHistoricalRatesTitle}
            </AppText>
            <AppText variant="caption" color="secondary">
              {copy.groupedRatesNote}
            </AppText>
            {visibleMissingRateQuotes.map((quote, index) => (
              <AppText
                key={`${quote.fromCurrency}-${quote.toCurrency}-${quote.rateDate}-${index}`}
                variant="body"
              >
                {copy.missingHistoricalExchangeRate(
                  quote.fromCurrency,
                  quote.toCurrency,
                  new Date(quote.rateDate).toLocaleDateString(),
                )}
              </AppText>
            ))}
            {missingRateQuotes.length > visibleMissingRateQuotes.length ? (
              <AppText variant="caption" color="secondary">
                {copy.additionalRatesNotListed(
                  missingRateQuotes.length - visibleMissingRateQuotes.length,
                )}
              </AppText>
            ) : null}
          </View>
        ) : (
          <AppText variant="body" color="secondary">
            {request.context === 'safe-to-spend'
              ? copy.safeToSpendUnidentifiedItems
              : copy.unidentifiedItems}
          </AppText>
        )}
        {actionableBalances && unresolvedPairs !== null ? (
          <View style={{ gap: Spacing.md }}>
            {refreshMessage ? (
              <AppText variant="caption" color="warning">
                {refreshMessage}
              </AppText>
            ) : null}
            <AppText variant="subheading" weight="bold">
              {copy.manualRatesTitle}
            </AppText>
            <AppText variant="caption" color="secondary">
              {copy.manualRatesDescription}
            </AppText>
            {pairsToResolve.map(pair => (
              <AppInput
                key={pairKey(pair)}
                testID={`incomplete-fx-manual-rate-${pair.fromCurrency.toLowerCase()}-${pair.toCurrency.toLowerCase()}`}
                label={copy.manualRateInputLabel(pair.fromCurrency, pair.toCurrency)}
                value={rateInputs[pairKey(pair)] ?? ''}
                onChangeText={value =>
                  setRateInputs(previous => ({ ...previous, [pairKey(pair)]: value }))
                }
                keyboardType="decimal-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
            ))}
            {saveError ? (
              <AppText variant="caption" color="error">
                {copy.manualRateSaveFailed}
              </AppText>
            ) : null}
          </View>
        ) : null}
      </View>
    </InfoSheet>
  );
}
