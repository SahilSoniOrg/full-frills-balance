export type ChartPoint = { x: number; y: number };

export type RunningBalanceTx = {
  transactionDate: number;
  runningBalance: number | null | undefined;
};

export type BuildAccountRollingBalanceSeriesInput = {
  transactions: RunningBalanceTx[];
  msPerDay: number;
  /** Rolling average window length in days. Default 7. */
  rollingWindowDays?: number;
  /** Extra days past visibleEnd included in series. Default 7. */
  paddingDays?: number;
  /** Last instant to plot, e.g. end of today, so future days stay empty. Ticks still span the window. */
  dataEnd?: number;
  /** Number of x-axis ticks. Default 4. */
  tickCount?: number;
} & (
  | {
      /** Visible window start (ms). Defaults to first transaction. */
      visibleStart?: number;
      /** Visible window end (ms). Defaults to last transaction. */
      visibleEnd?: number;
      openingBalance?: undefined;
    }
  | {
      visibleStart: number;
      visibleEnd: number;
      /** Seed the whole period and express daily closes relative to this balance, without an average. */
      openingBalance: number;
    }
);

export type AccountRollingBalanceSeries = {
  chartData: ChartPoint[];
  rollingAverageData: ChartPoint[];
  xTicks: number[];
};

/**
 * Builds daily closing-balance points and a trailing rolling average for account charts.
 * Forward-fills missing runningBalance from the previous known balance.
 */
export function buildAccountRollingBalanceSeries(
  input: BuildAccountRollingBalanceSeriesInput,
): AccountRollingBalanceSeries {
  const {
    transactions,
    msPerDay,
    openingBalance,
    rollingWindowDays = 7,
    paddingDays = 7,
    tickCount = 4,
  } = input;

  if (!transactions.length && openingBalance === undefined) {
    return { chartData: [], rollingAverageData: [], xTicks: [] };
  }

  const visibleStart = input.visibleStart ?? transactions[0].transactionDate;
  const visibleEnd = input.visibleEnd ?? transactions[transactions.length - 1].transactionDate;
  const effectiveMaxX = visibleEnd + paddingDays * msPerDay;

  const ticks: number[] = [];
  const range = effectiveMaxX - visibleStart;
  const step = tickCount > 1 ? range / (tickCount - 1) : 0;
  for (let i = 0; i < tickCount; i++) ticks.push(visibleStart + step * i);

  const dailyBalances: ChartPoint[] = [];
  let currentDayStart = new Date(
    openingBalance === undefined ? transactions[0].transactionDate : visibleStart,
  ).setHours(0, 0, 0, 0);
  const lastDayEnd = new Date(Math.min(effectiveMaxX, input.dataEnd ?? Infinity)).setHours(
    23,
    59,
    59,
    999,
  );
  let balance =
    openingBalance ?? transactions.find(t => t.runningBalance != null)?.runningBalance ?? 0;
  let pi = 0;
  while (currentDayStart <= lastDayEnd) {
    const nds = currentDayStart + msPerDay;
    while (pi < transactions.length && transactions[pi].transactionDate < nds) {
      const transaction = transactions[pi];
      // The opening balance already includes all earlier transactions.
      if (openingBalance === undefined || transaction.transactionDate >= visibleStart) {
        balance = transaction.runningBalance ?? balance;
      }
      pi++;
    }
    dailyBalances.push({ x: currentDayStart, y: balance - (openingBalance ?? 0) });
    currentDayStart = nds;
  }

  const fullRolling =
    openingBalance === undefined
      ? dailyBalances.map((db, i) => {
          let sum = 0;
          let count = 0;
          for (let j = 0; j < rollingWindowDays; j++) {
            if (i - j >= 0) {
              sum += dailyBalances[i - j].y;
              count++;
            }
          }
          return { x: db.x, y: count > 0 ? sum / count : 0 };
        })
      : [];

  return {
    chartData: dailyBalances.filter(p => p.x >= visibleStart && p.x <= effectiveMaxX),
    rollingAverageData: fullRolling.filter(p => p.x >= visibleStart && p.x <= effectiveMaxX),
    xTicks: ticks,
  };
}
