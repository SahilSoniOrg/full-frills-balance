import { AppConfig } from '@/src/constants/app-config';

export type HistoricalRateQuote = {
  rate: number;
  effectiveDate: number;
  source: string;
};

export type HistoricalRate = HistoricalRateQuote & {
  requestedDate: number;
};

type JsonRecord = Record<string, unknown>;

const npmSource = 'fawazahmed0/currency-api:historical';
const ecbSource = 'frankfurter/ecb:historical';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function parseProviderDate(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Historical exchange rate response is missing a valid date');
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Historical exchange rate response has an invalid date: ${value}`);
  }

  return parsed.getTime();
}

async function fetchJson(url: string, errorPrefix: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    const statusText = response.statusText ? `: ${response.statusText}` : '';
    throw new Error(`${errorPrefix} (${response.status})${statusText}`);
  }

  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType && !contentType.includes('application/json')) {
    throw new Error(`Expected JSON response but got ${contentType}`);
  }

  return response.json();
}

function quoteFromNpmSnapshot(
  payload: unknown,
  fromCurrency: string,
  toCurrency: string,
): HistoricalRateQuote | null {
  if (!isRecord(payload)) return null;

  const rates = payload[fromCurrency.toLowerCase()];
  if (!isRecord(rates)) return null;

  const rate = rates[toCurrency.toLowerCase()];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;

  return {
    rate,
    effectiveDate: parseProviderDate(payload.date),
    source: npmSource,
  };
}

function quoteFromEcbResponse(
  payload: unknown,
  fromCurrency: string,
  toCurrency: string,
): HistoricalRateQuote {
  if (!isRecord(payload)) {
    throw new Error('ECB historical exchange rate response is invalid');
  }

  if (
    typeof payload.base === 'string' &&
    payload.base.toUpperCase() !== fromCurrency.toUpperCase()
  ) {
    throw new Error(`ECB response base currency mismatch: ${payload.base}`);
  }
  if (
    typeof payload.quote === 'string' &&
    payload.quote.toUpperCase() !== toCurrency.toUpperCase()
  ) {
    throw new Error(`ECB response quote currency mismatch: ${payload.quote}`);
  }

  const rate = payload.rate;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new Error('ECB historical exchange rate response is missing a valid rate');
  }

  return {
    rate,
    effectiveDate: parseProviderDate(payload.date),
    source: ecbSource,
  };
}

export async function fetchHistoricalRate(
  fromCurrency: string,
  toCurrency: string,
  isoDate: string,
): Promise<HistoricalRateQuote> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  const currencyPath = `v1/currencies/${encodeURIComponent(from.toLowerCase())}.min.json`;
  const npmUrls =
    isoDate >= AppConfig.api.exchangeRateHistoricalEarliestDate
      ? [
          `${AppConfig.api.exchangeRateHistoricalBaseUrl}${isoDate}/${currencyPath}`,
          `${AppConfig.api.exchangeRateHistoricalFallbackBaseUrl}${isoDate}.currency-api.pages.dev/${currencyPath}`,
        ]
      : [];

  let lastError: Error | undefined;

  for (const url of npmUrls) {
    try {
      const payload = await fetchJson(url, 'Historical exchange rate API error');
      const quote = quoteFromNpmSnapshot(payload, from, to);
      if (quote) return quote;
      if (isRecord(payload) && typeof payload.date === 'string') break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  const ecbUrl = `${AppConfig.api.exchangeRateHistoricalFrankfurterEcbUrl}/${from.toLowerCase()}/${to.toLowerCase()}?date=${isoDate}`;
  try {
    const payload = await fetchJson(ecbUrl, 'ECB historical exchange rate API error');
    return quoteFromEcbResponse(payload, from, to);
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
  }

  throw lastError || new Error(`No historical exchange rate found for ${from} -> ${to}`);
}
