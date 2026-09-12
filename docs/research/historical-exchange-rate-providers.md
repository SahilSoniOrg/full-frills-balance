# Historical exchange-rate providers

Research date: 2026-09-12

## Recommendation

Use a two-tier lookup:

1. Keep the existing npm-backed `@fawazahmed0/currency-api` source for dates from 2024-03-02 onward.
2. Fall back to Frankfurter, pinned to the ECB provider, for older dates and pairs that the ECB covers.

If neither source can produce a rate, preserve the imported record with an explicit missing-rate status and require manual input. Do not use the current rate, `1`, or a nearby date without telling the user.

Frankfurter is the best default fallback because it exposes exact-date lookups without an API key or monthly quota, supports a broad set of currencies, and can identify or pin the underlying provider. Its default response is blended; for reproducible accounting values, use its ECB provider route instead of the blend.

## Comparison

| Provider                             | Historical coverage                                                                                                             | Access                                                                                                 | Fit for this app                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `@fawazahmed0/currency-api`          | Daily snapshots from 2024-03-02 onward; coverage is date/package dependent                                                      | No key; npm package served through jsDelivr, with a Cloudflare fallback                                | Keep for recent dates. The earliest date is the hard gap.                                                          |
| Frankfurter                          | 205 currencies overall, with coverage varying by currency; the service documents history back to 1948 and EUR history from 1999 | No key; no monthly quota, but fair-use rate limiting                                                   | Best free fallback. Pin `ecb` for stable provenance.                                                               |
| ECB Data Portal                      | Official daily EUR reference series; many major currencies from the euro era, generally 1999 onward                             | Direct public SDMX API; free reuse with source attribution and no modification of published statistics | Strongest provenance, but narrower coverage and requires EUR-based cross-rate/inversion logic for arbitrary pairs. |
| Open Exchange Rates                  | Historical endpoint back to 1999; broad currency coverage                                                                       | App ID required; free plan is quota-limited and USD-base only                                          | Technically viable, but a client app would expose the App ID. Better behind a server/proxy.                        |
| freecurrencyapi                      | Historical dates from 1999-01-01; 32 currencies on the free offering                                                            | API key required and quota-limited; free offering is private-use oriented                              | Good only if coverage and key handling are acceptable. Not a clean client-side fallback.                           |
| Fixer / currencylayer                | Historical data back to 1999                                                                                                    | API key and low free-plan quotas; paid plans add important features                                    | Backup commercial options, not preferable for a local-first client app.                                            |
| ExchangeRate-API historical endpoint | Historical data from 2021 for all supported currencies and 1990–2020 for a smaller set                                          | Historical endpoint requires a paid plan                                                               | Not a free solution for the older-date gap.                                                                        |

## Primary sources and evidence

- [fawazahmed0 exchange-api README](https://github.com/fawazahmed0/exchange-api): documents the npm-backed date URL format, daily snapshots, and Cloudflare fallback.
- [fawazahmed0 historical-data issue](https://github.com/fawazahmed0/exchange-api/issues/124): records that the available historical dataset starts on 2024-03-02. Direct checks on 2026-09-12 returned 404 for 2024-03-01 and 200 for 2024-03-02.
- [Frankfurter API](https://frankfurter.dev/): documents exact-date and time-series endpoints, no API key, no monthly quota, provider pinning, and overall coverage back to 1948.
- [Frankfurter v1 historical endpoint](https://frankfurter.dev/v1/): documents a dated lookup such as `1999-01-04`.
- [ECB Data Portal API data examples](https://data.ecb.europa.eu/help/api/data-examples): documents daily EXR series and `startPeriod`/`endPeriod` filtering.
- [ECB reuse policy](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.nl.html): permits free reuse of public statistics with source attribution and without modifying the statistics or metadata.
- [Open Exchange Rates historical endpoint](https://docs.openexchangerates.org/reference/historical-json): documents exact-date history back to 1999 and the `app_id` requirement.
- [Open Exchange Rates pricing](https://openexchangerates.org/signup): documents the free plan's historical access, USD base, and request allowance.
- [freecurrencyapi historical endpoint](https://freecurrencyapi.com/docs/historical): documents dates from 1999-01-01 and API-key authentication.
- [freecurrencyapi product page](https://freecurrencyapi.com/): documents the free offering's 32-currency coverage and private-use limitation.
- [Fixer pricing](https://fixer.io/pricing): documents free historical access with a 100-request monthly limit.
- [currencylayer pricing](https://currencylayer.com/pricing/): documents free historical access with a 100-request monthly limit and history back to 1999.
- [ExchangeRate-API historical documentation](https://www.exchangerate-api.com/docs/historical-data-requests): documents its paid-only historical endpoint and date coverage.

## Implementation implications

- Store `source`, `effectiveDate`, and the requested calendar date with every resolved historical rate.
- Cache historical rates permanently; they should not be treated as a 24-hour “latest” cache.
- For cross-currency pairs, normalize both directions and calculate through a common base when the provider only publishes EUR-based series.
- Treat weekends/holidays as a provider-specific “last published business day” policy, not as an invisible date substitution.
- Imports should continue when a rate cannot be resolved, but should surface the unresolved record. Journal posting and reports must not silently value that line.

## ECB integration shape

The direct ECB endpoint is an SDMX API. For a date and a set of currencies, request the daily spot series against EUR:

```text
https://data-api.ecb.europa.eu/service/data/EXR/D.USD%2BINR.EUR.SP00.A?endPeriod=2020-01-02&lastNObservations=1&format=jsondata
```

The response contains a series for each currency and a value meaning “units of that currency per EUR”. Let `perEur(C)` be that value, with `perEur(EUR) = 1`:

```text
rate(from, to) = perEur(to) / perEur(from)
```

Therefore USD→INR is `INR/EUR ÷ USD/EUR`; USD→EUR is `1 ÷ USD/EUR`. For weekends and ECB holidays, `endPeriod` plus `lastNObservations=1` returns the latest published observation on or before the requested date. The app must store that returned effective date separately from the journal date.

For less SDMX parsing, the same ECB-backed data is exposed by Frankfurter as:

```text
https://api.frankfurter.dev/v2/providers/ecb/rate/eur/usd?date=1999-01-04
```

## Open Exchange Rates free-plan limits

The current free plan provides hourly updates, daily historical data, and 1,000 API requests per month. It has no advanced queries, and the free base currency is USD; changing the base requires a paid plan. Each request to `historical/*.json` counts as one request regardless of how many symbols are returned. That makes it viable for an import if rates are grouped by unique date and cached, but a shared App ID would be exposed in a client build and could be exhausted by other installations. Prefer a server-side proxy if this provider is selected.
