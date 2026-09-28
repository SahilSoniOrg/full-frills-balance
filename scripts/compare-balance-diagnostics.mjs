#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const EPSILON = 1e-7;

function usage() {
  console.error('Usage: node scripts/compare-balance-diagnostics.mjs <before.json> <after.json>');
}

function accountKey(account) {
  return JSON.stringify([account.name, account.accountType, account.currencyCode]);
}

function numericEqual(left, right) {
  if (left == null || right == null) return left === right;
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= EPSILON;
}

function money(value, currency = 'INR') {
  if (!Number.isFinite(value)) return String(value);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

async function readReport(file) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${file}: ${error.message}`);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !parsed.netWorth ||
    !Array.isArray(parsed.accounts) ||
    !Array.isArray(parsed.transactionAndSnapshotDetails)
  ) {
    throw new Error(`${file} is not a supported balance diagnostics report`);
  }

  const details = new Map();
  for (const account of parsed.transactionAndSnapshotDetails) {
    const key = accountKey(account);
    if (details.has(key)) throw new Error(`${file} has duplicate account identity: ${key}`);
    details.set(key, account);
  }

  const detailsById = new Map(
    parsed.transactionAndSnapshotDetails.map(account => [account.accountId, account]),
  );
  const comparisons = new Map();
  for (const account of parsed.accounts) {
    // Account comparison rows omit type and currency; resolve them by imported ID.
    const joined = detailsById.get(account.accountId);
    if (!joined) throw new Error(`${file} has no transaction details for ${account.name}`);
    const key = accountKey(joined);
    if (comparisons.has(key)) throw new Error(`${file} has duplicate account comparison: ${key}`);
    comparisons.set(key, { comparison: account, detail: joined });
  }

  if (comparisons.size !== details.size) {
    throw new Error(`${file} account summary/detail counts do not match`);
  }
  return { ...parsed, accountsByKey: comparisons, sourceFile: basename(file) };
}

function comparableAccount(entry) {
  const { comparison, detail } = entry;
  return {
    transactionCount: detail.transactionCount,
    databaseLatestBalance: detail.databaseLatestBalance,
    fullyRecomputedBalance: detail.fullyRecomputedBalance,
    balanceDifference: detail.balanceDifference,
    transactionBalanceMismatchCount: detail.transactionBalanceMismatchCount,
    latestTransactionDate: detail.latestTransaction?.date ?? null,
    latestTransactionAmount: detail.latestTransaction?.amount ?? null,
    latestTransactionBalance: detail.latestTransaction?.runningBalance ?? null,
    latestSnapshotDate: detail.latestSnapshot?.date ?? null,
    latestSnapshotBalance: detail.latestSnapshot?.balance ?? null,
    latestSnapshotCount: detail.latestSnapshot?.transactionCount ?? null,
    liveAccountListBalance: comparison.liveAccountListBalance,
    persistedAccountListBalance: comparison.persistedAccountListBalance,
  };
}

function compareAccounts(before, after) {
  const beforeKeys = new Set(before.accountsByKey.keys());
  const afterKeys = new Set(after.accountsByKey.keys());
  const missingAfter = [...beforeKeys].filter(key => !afterKeys.has(key));
  const newAfter = [...afterKeys].filter(key => !beforeKeys.has(key));
  const changed = [];

  for (const key of beforeKeys) {
    if (!after.accountsByKey.has(key)) continue;
    const left = comparableAccount(before.accountsByKey.get(key));
    const right = comparableAccount(after.accountsByKey.get(key));
    const fields = {};
    for (const field of Object.keys(left)) {
      const equal = typeof left[field] === 'number' && typeof right[field] === 'number'
        ? numericEqual(left[field], right[field])
        : left[field] === right[field];
      if (!equal) fields[field] = { before: left[field], after: right[field] };
    }
    if (Object.keys(fields).length) {
      changed.push({ name: before.accountsByKey.get(key).detail.name, fields });
    }
  }

  return { changed, missingAfter, newAfter };
}

function summarizeQueue(queue = {}) {
  return [
    ...(queue.inMemory ?? []),
    ...(queue.persisted ?? []),
    ...(queue.processingBatch ?? []),
    ...(queue.pendingRetries ?? []),
    ...(queue.rebuildLocks ?? []),
  ].length;
}

function mismatchTotal(report) {
  return report.transactionAndSnapshotDetails.reduce(
    (sum, account) => sum + (account.transactionBalanceMismatchCount ?? 0),
    0,
  );
}

function recomputeNetWorth(report) {
  if (Number.isFinite(report.spotValuation?.netWorth)) {
    return report.spotValuation.netWorth;
  }
  const rates = report.spotRatesToTarget;
  if (!rates || typeof rates !== 'object') return null;

  let netWorth = 0;
  for (const { comparison, detail } of report.accountsByKey.values()) {
    if (detail.accountType !== 'ASSET' && detail.accountType !== 'LIABILITY') continue;
    const currency = detail.currencyCode;
    const rate = currency === report.currencyCode ? 1 : rates[currency];
    if (!Number.isFinite(rate)) return null;
    const balance = comparison.liveAccountListBalance;
    if (!Number.isFinite(balance)) return null;
    netWorth += balance * rate * (detail.accountType === 'ASSET' ? 1 : -1);
  }

  return Math.round((netWorth + Number.EPSILON) * 100) / 100;
}

function netAssetsByCurrency(report) {
  const totals = new Map();
  for (const { comparison, detail } of report.accountsByKey.values()) {
    if (detail.accountType !== 'ASSET' && detail.accountType !== 'LIABILITY') continue;
    const balance = comparison.liveAccountListBalance;
    if (!Number.isFinite(balance)) continue;
    const sign = detail.accountType === 'ASSET' ? 1 : -1;
    totals.set(detail.currencyCode, (totals.get(detail.currencyCode) ?? 0) + sign * balance);
  }
  return totals;
}

function effectiveRatesByCurrency(report) {
  if (!report.spotValuation?.accounts) return null;
  const rates = new Map();
  for (const account of report.spotValuation.accounts) {
    if (account.accountType !== 'ASSET' && account.accountType !== 'LIABILITY') continue;
    if (account.rateToWorkplaceCurrency == null) continue;
    const list = rates.get(account.currencyCode) ?? [];
    if (!list.some(rate => numericEqual(rate, account.rateToWorkplaceCurrency))) {
      list.push(account.rateToWorkplaceCurrency);
    }
    rates.set(account.currencyCode, list);
  }
  return rates;
}

function sameRates(before, after) {
  const left = effectiveRatesByCurrency(before);
  const right = effectiveRatesByCurrency(after);
  if (left && right) {
    const currencies = new Set([...left.keys(), ...right.keys()]);
    return [...currencies].every(currency => {
      const leftRates = left.get(currency) ?? [];
      const rightRates = right.get(currency) ?? [];
      return leftRates.length === rightRates.length && leftRates.every(rate =>
        rightRates.some(candidate => numericEqual(rate, candidate)),
      );
    });
  }

  const legacyLeft = before.spotRatesToTarget;
  const legacyRight = after.spotRatesToTarget;
  if (!legacyLeft || !legacyRight) return null;
  const currencies = new Set([...Object.keys(legacyLeft), ...Object.keys(legacyRight)]);
  return [...currencies].every(currency =>
    numericEqual(legacyLeft[currency], legacyRight[currency]),
  );
}

async function main() {
  const [, , beforePath, afterPath] = process.argv;
  if (!beforePath || !afterPath) {
    usage();
    process.exitCode = 2;
    return;
  }

  const [before, after] = await Promise.all([readReport(beforePath), readReport(afterPath)]);
  const comparison = compareAccounts(before, after);
  const currency = before.currencyCode ?? after.currencyCode ?? 'INR';
  const netWorthDelta = after.netWorth.live - before.netWorth.live;
  const sameEffectiveRates = sameRates(before, after);

  console.log(`Before: ${before.sourceFile} (${before.generatedAt ?? 'unknown time'})`);
  console.log(`After:  ${after.sourceFile} (${after.generatedAt ?? 'unknown time'})`);
  console.log(`Accounts: ${before.accountsByKey.size} before, ${after.accountsByKey.size} after`);
  console.log(`Account numeric inputs changed: ${comparison.changed.length}`);
  console.log(`Accounts missing after: ${comparison.missingAfter.length}`);
  console.log(`Accounts added after: ${comparison.newAfter.length}`);
  console.log(`Transaction-balance mismatches: ${mismatchTotal(before)} before, ${mismatchTotal(after)} after`);
  console.log(`Pending queue/lock entries: ${summarizeQueue(before.rebuildQueue)} before, ${summarizeQueue(after.rebuildQueue)} after`);
  console.log(`Net worth: ${money(before.netWorth.live, currency)} before, ${money(after.netWorth.live, currency)} after`);
  console.log(`Net-worth change: ${money(netWorthDelta, currency)}`);

  for (const report of [before, after]) {
    if (report.spotValuation) {
      const drift = report.spotValuation.netWorth - report.netWorth.live;
      console.log(
        `${report.sourceFile} traced valuation: ${money(report.spotValuation.netWorth, currency)} (${money(drift, currency)} vs reported live net worth)`,
      );
    }
  }

  const beforeByCurrency = netAssetsByCurrency(before);
  const afterByCurrency = netAssetsByCurrency(after);
  const currencies = [...new Set([...beforeByCurrency.keys(), ...afterByCurrency.keys()])].sort();
  console.log('Unconverted net assets by currency:');
  for (const code of currencies) {
    const left = beforeByCurrency.get(code) ?? 0;
    const right = afterByCurrency.get(code) ?? 0;
    console.log(`- ${code}: ${left.toFixed(2)} before, ${right.toFixed(2)} after${numericEqual(left, right) ? '' : ` (change ${(right - left).toFixed(2)})`}`);
  }

  if (comparison.changed.length) {
    console.log('\nChanged account inputs:');
    for (const item of comparison.changed.slice(0, 20)) {
      console.log(`- ${item.name}: ${JSON.stringify(item.fields)}`);
    }
  } else if (comparison.missingAfter.length === 0 && comparison.newAfter.length === 0) {
    console.log('Result: account balances and transaction/snapshot checks match across reports.');
  }

  if (sameEffectiveRates === null) {
    console.log('FX comparison: unavailable; reports do not include spot valuation rates.');
  } else {
    console.log(`Effective spot rates identical: ${sameEffectiveRates}`);
    const beforeRates = effectiveRatesByCurrency(before);
    const afterRates = effectiveRatesByCurrency(after);
    if (beforeRates && afterRates) {
      const rateCurrencies = [...new Set([...beforeRates.keys(), ...afterRates.keys()])].sort();
      for (const code of rateCurrencies) {
        console.log(
          `- ${code} -> ${currency}: ${(beforeRates.get(code) ?? []).join(', ') || 'missing'} before; ${(afterRates.get(code) ?? []).join(', ') || 'missing'} after`,
        );
      }
    }
    const beforeRecomputed = recomputeNetWorth(before);
    const afterRecomputed = recomputeNetWorth(after);
    console.log(
      `Net worth recomputed from report inputs: ${money(beforeRecomputed, currency)} before, ${money(afterRecomputed, currency)} after`,
    );
  }

  if (before.generatedAt && after.generatedAt && before.generatedAt > after.generatedAt) {
    console.log('Warning: the report called before has a later generatedAt timestamp than after.');
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
