/**
 * @owner mobile
 * @dataSource user-approved local backup
 * @platform android
 */
import { by, device, element, waitFor } from 'detox';
import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { E2E_AUTH_TOKEN } from '@/src/testing/e2eConstants';

jest.setTimeout(600000);

const APP_ID = 'in.sahilsoni.fullfrillsbalance.preview';
const DEVICE_ID = process.env.DETOX_ANDROID_DEVICE_ID;
const BENCHMARK_BUDGET_NAME = `A13 Benchmark ${Date.now()}`;
const PROGRESS_LOG_PATH = '/tmp/full-frills-balance-android-performance.log';
const PERF_RUN_ID = Date.now().toString(36);
const TRANSITION_CYCLES = 5;
const ACCOUNT_DETAIL_SAMPLES = Number(process.env.FFB_ANDROID_PERF_ACCOUNT_SAMPLES || 5);
const ACCOUNT_ONLY = process.env.FFB_ANDROID_PERF_SCOPE === 'account';
const ACCOUNT_ABLATION = process.env.FFB_ANDROID_PERF_ABLATION === '1';
const ACCOUNT_DEFER_COMPARISON = process.env.FFB_ANDROID_PERF_DEFER_COMPARISON === '1';
const ACCOUNT_DEFER_MODE = process.env.FFB_ANDROID_PERF_DEFER_MODE;
const ACCOUNT_TRACE_PATH = process.env.FFB_ANDROID_PERF_ACCOUNT_TRACE;
const HERMES_PROFILE = process.env.FFB_ANDROID_PERF_HERMES === '1';
const ACCOUNT_RENDER_MODES = ['full', 'no-chart', 'no-chart-no-rows', 'summary-no-rows'] as const;
type AccountRenderMode = (typeof ACCOUNT_RENDER_MODES)[number] | 'deferred-full';

type Measurement = { name: string; samplesMs: number[] };

function logBenchmark(message: string): void {
  const line = `[PERF-ANDROID] ${message}\n`;
  appendFileSync(PROGRESS_LOG_PATH, line);
  process.stdout.write(line);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : (sorted[mid] ?? 0);
}

function percentile(values: readonly number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)] ?? 0;
}

function adb(...args: string[]): string {
  if (!DEVICE_ID) throw new Error('DETOX_ANDROID_DEVICE_ID must identify the connected phone.');
  return execFileSync('adb', ['-s', DEVICE_ID, ...args], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function pause(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readAccountPerfEvents(): { timestampSec: number; message: string }[] {
  const logcat = adb('shell', 'logcat', '-d', '-v', 'epoch', '-s', 'ReactNativeJS:V', 'FFB-PERF:I');
  const events: { timestampSec: number; message: string }[] = [];
  for (const line of logcat.split('\n')) {
    if (!line.includes('[FFB_PERF]') && !line.includes('account_open_start_')) continue;
    const match = line.match(/^\s*(\d+\.\d+)\s+\d+\s+\d+\s+[VDIWEF]\s+[^:]+:\s?(.*)$/);
    if (!match) continue;
    events.push({ timestampSec: Number(match[1]), message: match[2] ?? '' });
  }
  return events;
}

async function waitForAccountPerfEvents(
  mode: AccountRenderMode,
  startMarker: string,
): Promise<{
  summaryLayoutMs: number;
  usableContentMs: number;
  journalRows: number;
  chartPoints: number;
}> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const events = readAccountPerfEvents();
    const start = events.find(event => event.message.includes(startMarker));
    const summary = events.find(
      event =>
        event.timestampSec > (start?.timestampSec ?? Infinity) &&
        event.message.includes(`[FFB_PERF] event=summary_layout mode=${mode}`),
    );
    const usable = events.find(
      event =>
        event.timestampSec > (start?.timestampSec ?? Infinity) &&
        event.message.includes(`[FFB_PERF] event=usable_content_commit mode=${mode}`),
    );
    if (start && summary && usable) {
      const rows = usable.message.match(/journalRows=(\d+)/)?.[1] ?? 'n/a';
      const points = usable.message.match(/chartPoints=(\d+)/)?.[1] ?? 'n/a';
      return {
        summaryLayoutMs: Math.round((summary.timestampSec - start.timestampSec) * 1000),
        usableContentMs: Math.round((usable.timestampSec - start.timestampSec) * 1000),
        journalRows: Number(rows),
        chartPoints: Number(points),
      };
    }
    await pause(250);
  }
  throw new Error(`Timed out waiting for app-side account markers for ${mode}.`);
}

async function waitForAccountPerfEvent(
  mode: AccountRenderMode,
  startMarker: string,
  eventName: string,
): Promise<number> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const events = readAccountPerfEvents();
    const start = events.find(event => event.message.includes(startMarker));
    const event = events.find(
      candidate =>
        candidate.timestampSec > (start?.timestampSec ?? Infinity) &&
        candidate.message.includes(`[FFB_PERF] event=${eventName} mode=${mode}`),
    );
    if (start && event) return Math.round((event.timestampSec - start.timestampSec) * 1000);
    await pause(250);
  }
  throw new Error(`Timed out waiting for ${eventName} marker for ${mode}.`);
}

async function runAccountRenderAblations(): Promise<void> {
  for (let modeIndex = 0; modeIndex < ACCOUNT_RENDER_MODES.length; modeIndex += 1) {
    const mode = ACCOUNT_RENDER_MODES[modeIndex]!;
    const summaryLayoutSamples: number[] = [];
    const usableContentSamples: number[] = [];
    if (modeIndex > 0) {
      await device.launchApp({
        newInstance: true,
        delete: false,
        launchArgs: { e2eAuth: E2E_AUTH_TOKEN, e2eAccountRenderMode: mode },
      });
      await waitVisible('dashboard-screen');
      logBenchmark(`phase=dashboard-ready mode=${mode}`);
    }

    // The app's delayed stabilization batch starts after idle + 3 seconds.
    // Holding each variant for the same interval keeps it out of the measured work.
    await pause(45000);
    await element(by.id('tab-accounts')).tap();
    await waitVisible('accounts-screen');
    await waitFor(element(by.id('account-card-open')).atIndex(0))
      .toBeVisible()
      .withTimeout(60000);
    logBenchmark(`phase=account-list-settled mode=${mode}`);

    for (let sample = 1; sample <= ACCOUNT_DETAIL_SAMPLES; sample += 1) {
      resetFrameStats();
      const startMarker = `account_open_start_${PERF_RUN_ID}_${mode}_${sample}`;
      await device.disableSynchronization();
      try {
        adb('shell', 'log', '-p', 'i', '-t', 'FFB-PERF', startMarker);
        await element(by.id('account-card-open')).atIndex(0).tap();
        await waitVisible('account-balance');
        const appTiming = await waitForAccountPerfEvents(mode, startMarker);
        summaryLayoutSamples.push(appTiming.summaryLayoutMs);
        usableContentSamples.push(appTiming.usableContentMs);
        logBenchmark(
          `account_open mode=${mode} sample=${sample} tap_to_summary_layout_ms=${appTiming.summaryLayoutMs} tap_to_usable_content_ms=${appTiming.usableContentMs} journal_rows=${appTiming.journalRows} chart_points=${appTiming.chartPoints}`,
        );
        await pause(750);
        reportFrameStats(`account_open_${mode}_${sample}`);

        resetFrameStats();
        adb('shell', 'log', '-p', 'i', '-t', 'FFB-PERF', `account_back_start_${mode}_${sample}`);
        await element(by.id('nav-back-button')).tap();
        await waitVisible('accounts-screen');
        await waitFor(element(by.id('account-card-open')).atIndex(0))
          .toBeVisible()
          .withTimeout(60000);
        await pause(750);
        reportFrameStats(`account_back_${mode}_${sample}`);
      } finally {
        await device.enableSynchronization();
      }
    }
    logBenchmark(
      `account_open_summary mode=${mode} n=${summaryLayoutSamples.length} summary_layout_median_ms=${median(summaryLayoutSamples)} usable_content_median_ms=${median(usableContentSamples)} usable_content_p95_ms=${percentile(usableContentSamples, 0.95)}`,
    );
    logBenchmark(`phase=account-render-mode-complete mode=${mode}`);
  }
}

async function runAccountDeferralComparison(): Promise<void> {
  const modes: readonly AccountRenderMode[] =
    ACCOUNT_DEFER_MODE === 'full' || ACCOUNT_DEFER_MODE === 'deferred-full'
      ? [ACCOUNT_DEFER_MODE]
      : ['full', 'deferred-full'];
  for (let modeIndex = 0; modeIndex < modes.length; modeIndex += 1) {
    const mode = modes[modeIndex]!;
    const summaryLayoutSamples: number[] = [];
    const usableContentSamples: number[] = [];
    const transitionSamples: number[] = [];
    const secondaryContentSamples: number[] = [];

    if (modeIndex > 0) {
      await device.launchApp({
        newInstance: true,
        delete: false,
        launchArgs: { e2eAuth: E2E_AUTH_TOKEN, e2eAccountRenderMode: mode },
      });
      await waitVisible('dashboard-screen');
      logBenchmark(`phase=dashboard-ready mode=${mode}`);
    }

    await pause(45000);
    await element(by.id('tab-accounts')).tap();
    await waitVisible('accounts-screen');
    await waitFor(element(by.id('account-card-open')).atIndex(0))
      .toBeVisible()
      .withTimeout(60000);
    logBenchmark(`phase=account-list-settled mode=${mode}`);

    for (let sample = 1; sample <= ACCOUNT_DETAIL_SAMPLES; sample += 1) {
      resetFrameStats();
      const startMarker = `account_open_start_${PERF_RUN_ID}_${mode}_${sample}`;
      await device.disableSynchronization();
      try {
        adb('shell', 'log', '-p', 'i', '-t', 'FFB-PERF', startMarker);
        await element(by.id('account-card-open')).atIndex(0).tap();
        const transitionMs = await waitForAccountPerfEvent(mode, startMarker, 'transition_end');
        transitionSamples.push(transitionMs);
        logBenchmark(
          `account_transition mode=${mode} sample=${sample} transition_end_ms=${transitionMs}`,
        );
        reportFrameStats(`account_transition_${mode}_${sample}`);

        resetFrameStats();
        const appTiming = await waitForAccountPerfEvents(mode, startMarker);
        const secondaryContentMs = await waitForAccountPerfEvent(
          mode,
          startMarker,
          'secondary_content_commit',
        );
        const activityLayoutMs = await waitForAccountPerfEvent(
          mode,
          startMarker,
          'activity_layout',
        );
        summaryLayoutSamples.push(appTiming.summaryLayoutMs);
        usableContentSamples.push(appTiming.usableContentMs);
        secondaryContentSamples.push(secondaryContentMs);
        logBenchmark(
          `account_staged_content mode=${mode} sample=${sample} summary_layout_ms=${appTiming.summaryLayoutMs} data_usable_ms=${appTiming.usableContentMs} activity_layout_ms=${activityLayoutMs} secondary_content_ms=${secondaryContentMs} journal_rows=${appTiming.journalRows} chart_points=${appTiming.chartPoints}`,
        );
        await pause(750);
        reportFrameStats(`account_after_transition_${mode}_${sample}`);

        await element(by.id('nav-back-button')).tap();
        await waitVisible('accounts-screen');
        await waitFor(element(by.id('account-card-open')).atIndex(0))
          .toBeVisible()
          .withTimeout(60000);
        await pause(500);
      } finally {
        await device.enableSynchronization();
      }
    }

    logBenchmark(
      `account_deferral_summary mode=${mode} n=${summaryLayoutSamples.length} summary_layout_median_ms=${median(summaryLayoutSamples)} data_usable_median_ms=${median(usableContentSamples)} transition_end_median_ms=${median(transitionSamples)} secondary_content_median_ms=${median(secondaryContentSamples)}`,
    );
    logBenchmark(`phase=account-deferral-mode-complete mode=${mode}`);
  }
}

async function waitVisible(id: string): Promise<void> {
  await waitFor(element(by.id(id)))
    .toBeVisible()
    .withTimeout(60000);
}

async function timedTransition(
  measurements: Measurement[],
  name: string,
  action: () => Promise<void>,
  ready: string | (() => Promise<void>),
): Promise<void> {
  // Measure the action through target visibility, not Detox's later app-idle wait.
  await device.disableSynchronization();
  const start = performance.now();
  try {
    await action();
    if (typeof ready === 'string') {
      await waitVisible(ready);
    } else {
      await ready();
    }
    const elapsedMs = Math.round(performance.now() - start);
    measurements.push({ name, samplesMs: [elapsedMs] });
    logBenchmark(`${name}_tap_to_visible_ms=${elapsedMs}`);
  } finally {
    await device.enableSynchronization();
  }
}

function reportMeasurements(measurements: Measurement[]): void {
  const groups = new Map<string, number[]>();
  for (const measurement of measurements) {
    const group = measurement.name.replace(/_\d+$/, '');
    const samples = groups.get(group) ?? [];
    samples.push(measurement.samplesMs[0] ?? 0);
    groups.set(group, samples);
  }

  for (const [name, samples] of groups) {
    logBenchmark(
      `${name}_tap_to_visible_summary_ms=n${samples.length},median${median(samples)},p95${percentile(samples, 0.95)}`,
    );
  }
}

function resetFrameStats(): void {
  adb('shell', 'dumpsys', 'gfxinfo', APP_ID, 'reset');
}

function reportFrameStats(phase: string): void {
  const gfx = adb('shell', 'dumpsys', 'gfxinfo', APP_ID);
  const read = (pattern: RegExp) => gfx.match(pattern)?.[1] ?? 'n/a';
  logBenchmark(
    `${phase}_frames=${read(/Total frames rendered:\s*(\d+)/)} ${phase}_janky_frames=${read(/Janky frames:\s*(\d+)/)} ${phase}_jank_percent=${read(/Janky frames:\s*\d+\s*\(([\d.]+)%\)/)} ${phase}_p50_ms=${read(/50th percentile:\s*(\d+)ms/)} ${phase}_p90_ms=${read(/90th percentile:\s*(\d+)ms/)} ${phase}_p95_ms=${read(/95th percentile:\s*(\d+)ms/)} ${phase}_p99_ms=${read(/99th percentile:\s*(\d+)ms/)}`,
  );
}

function reportMemory(): void {
  const mem = adb('shell', 'dumpsys', 'meminfo', APP_ID);
  const pssKb = mem.match(/TOTAL PSS:\s*(\d+)/)?.[1] ?? 'n/a';
  const rssKb = mem.match(/TOTAL RSS:\s*(\d+)/)?.[1] ?? 'n/a';
  logBenchmark(`final_pss_kb=${pssKb} final_rss_kb=${rssKb}`);
}

describe('Android page transition benchmark', () => {
  it('measures tabs, account details, and budget creation using the restored Preview data', async () => {
    if (device.getPlatform() !== 'android') throw new Error('This benchmark requires Android.');
    if (!DEVICE_ID) throw new Error('Set DETOX_ANDROID_DEVICE_ID to the connected ADB serial.');

    writeFileSync(PROGRESS_LOG_PATH, '');
    logBenchmark('phase=launch-start');
    await device.launchApp({
      newInstance: true,
      delete: false,
      launchArgs: {
        e2eAuth: E2E_AUTH_TOKEN,
        e2eAccountRenderMode: ACCOUNT_DEFER_MODE === 'deferred-full' ? 'deferred-full' : 'full',
        ...(HERMES_PROFILE ? { detoxFFBProfile: '1' } : {}),
      },
    });
    logBenchmark('phase=launch-finished');
    await waitVisible('dashboard-screen');
    logBenchmark('phase=restored-dashboard-ready');
    logBenchmark('measurement=tap_to_target_visible;detox_sync=disabled_during_timing');

    if (ACCOUNT_DEFER_COMPARISON) {
      await runAccountDeferralComparison();
      reportMemory();
      return;
    }

    if (ACCOUNT_ABLATION) {
      await runAccountRenderAblations();
      reportMemory();
      return;
    }

    resetFrameStats();

    const measurements: Measurement[] = [];
    for (let cycle = 1; !ACCOUNT_ONLY && cycle <= TRANSITION_CYCLES; cycle += 1) {
      await timedTransition(
        measurements,
        `dashboard_to_activity_${cycle}`,
        () => element(by.id('tab-activity')).tap(),
        'activity-screen',
      );
      await timedTransition(
        measurements,
        `activity_to_accounts_${cycle}`,
        () => element(by.id('tab-accounts')).tap(),
        'accounts-screen',
      );
      await timedTransition(
        measurements,
        `accounts_to_commitments_${cycle}`,
        () => element(by.id('tab-commitments')).tap(),
        'commitments-screen',
      );
      await timedTransition(
        measurements,
        `commitments_to_dashboard_${cycle}`,
        () => element(by.id('tab-dashboard')).tap(),
        'dashboard-screen',
      );
    }
    if (!ACCOUNT_ONLY) {
      logBenchmark('phase=tab-cycles-complete');
      reportFrameStats('tabs');
    }

    await element(by.id('tab-accounts')).tap();
    await waitVisible('accounts-screen');
    await waitFor(element(by.id('account-card-open')).atIndex(0))
      .toBeVisible()
      .withTimeout(60000);
    logBenchmark('phase=account-list-ready');
    resetFrameStats();
    const tracePid = ACCOUNT_TRACE_PATH
      ? adb(
          'shell',
          'perfetto',
          '--background-wait',
          '-o',
          ACCOUNT_TRACE_PATH,
          '-t',
          '30s',
          '-b',
          '64mb',
          '-a',
          APP_ID,
          'sched',
          'freq',
          'gfx',
          'view',
          'dalvik',
          'database',
        ).trim()
      : undefined;
    logBenchmark(`app_pid=${adb('shell', 'pidof', APP_ID).trim()}`);
    for (let index = 0; index < ACCOUNT_DETAIL_SAMPLES; index += 1) {
      logBenchmark(`phase=account-open-start-${index + 1}`);
      if (HERMES_PROFILE && index === 0) {
        adb('shell', 'am', 'broadcast', '-a', `${APP_ID}.PERF_START`, '-p', APP_ID);
      }
      await timedTransition(
        measurements,
        `account_detail_open_${index + 1}`,
        () => element(by.id('account-card-open')).atIndex(0).tap(),
        'account-balance',
      );
      logBenchmark(`phase=account-open-complete-${index + 1}`);
      if (HERMES_PROFILE && index === 0) {
        adb('shell', 'am', 'broadcast', '-a', `${APP_ID}.PERF_STOP`, '-p', APP_ID);
      }
      await element(by.id('nav-back-button')).tap();
      await waitVisible('accounts-screen');
    }
    logBenchmark('phase=account-details-complete');
    if (tracePid) adb('shell', 'kill', '-TERM', tracePid);
    reportFrameStats('account_details');
    resetFrameStats();

    if (ACCOUNT_ONLY) {
      reportMeasurements(measurements);
      reportMemory();
      return;
    }

    await element(by.id('tab-commitments')).tap();
    await waitVisible('commitments-screen');
    logBenchmark('phase=commitments-ready');
    await element(by.id('commitments-tabs-item-budgets')).tap();
    logBenchmark('phase=budgets-tab-ready');
    await timedTransition(
      measurements,
      'budget_form_open',
      async () => {
        await element(by.id('contextual-add-trigger')).tap();
        await waitVisible('contextual-add-budget');
        await element(by.id('contextual-add-budget')).tap();
      },
      'hero-name-input',
    );
    logBenchmark('phase=budget-form-open');

    await element(by.id('hero-name-input')).replaceText(BENCHMARK_BUDGET_NAME);
    await element(by.id('hero-amount-input')).replaceText('250');
    await device.pressBack();
    logBenchmark('phase=budget-form-filled');
    await element(by.id('budget-category-suggestion-first')).tap();
    logBenchmark('phase=budget-category-selected');

    logBenchmark('phase=budget-save-start');
    await timedTransition(
      measurements,
      'budget_save_to_list',
      async () => {
        await element(by.id('submit-footer-button')).tap();
      },
      () =>
        waitFor(element(by.text(BENCHMARK_BUDGET_NAME)))
          .toBeVisible()
          .withTimeout(120000),
    );
    logBenchmark('phase=budget-created');

    reportMeasurements(measurements);
    reportFrameStats('budget_flow');
    reportMemory();
  });
});
