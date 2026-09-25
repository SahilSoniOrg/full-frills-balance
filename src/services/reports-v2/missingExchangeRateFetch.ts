import { AppConfig } from '@/src/constants/app-config';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import type { MissingRateQuote } from '@/src/services/reports-v2/types/result';
import { runTasksWithBoundedConcurrency } from '@/src/utils/asyncConcurrency';

export type { MissingRateQuote };

export type MissingRateFetchResult = {
  attempted: number;
  fetched: number;
  failed: number;
};

export async function fetchMissingHistoricalRates(
  quotes: readonly MissingRateQuote[],
): Promise<MissingRateFetchResult> {
  if (quotes.length === 0) {
    return { attempted: 0, fetched: 0, failed: 0 };
  }

  let fetched = 0;
  let failed = 0;
  await runTasksWithBoundedConcurrency(
    quotes,
    AppConfig.performance.maxConcurrentOperations,
    async quote => {
      try {
        const result = await exchangeRateService.getHistoricalRate(
          quote.fromCurrency,
          quote.toCurrency,
          quote.rateDate,
        );
        if (Number.isFinite(result.rate) && result.rate > 0) {
          fetched += 1;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    },
  );

  return { attempted: quotes.length, fetched, failed };
}
