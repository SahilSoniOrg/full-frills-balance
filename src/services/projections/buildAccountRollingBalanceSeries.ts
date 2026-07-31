export type ChartPoint = { x: number; y: number };

export type RunningBalanceTx = {
  transactionDate: number;
  runningBalance: number | null | undefined;
};

export type BuildAccountRollingBalanceSeriesInput = {
  transactions: RunningBalanceTx[];
  /** Visible window start (ms). Defaults to first point. */
  visibleStart?: number;
  /** Visible window end (ms). Defaults to last point. */
  visibleEnd?: number;
  msPerDay: number;
  /** Rolling average window length in days. Default 7. */
  rollingWindowDays?: number;
  /** Extra days past visibleEnd included in series. Default 7. */
  paddingDays?: number;
  /** Number of x-axis ticks. Default 4. */
  tickCount?: number;
};

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
  const { transactions, msPerDay, rollingWindowDays = 7, paddingDays = 7, tickCount = 4 } = input;

  if (!transactions.length) {
    return { chartData: [], rollingAverageData: [], xTicks: [] };
  }

  const firstWithBalance = transactions.find(
    t => t.runningBalance !== undefined && t.runningBalance !== null,
  );
  const pts = transactions.reduce((acc, t) => {
    const lastBal = acc.length > 0 ? acc[acc.length - 1].y : firstWithBalance?.runningBalance || 0;
    const y =
      t.runningBalance !== undefined && t.runningBalance !== null ? t.runningBalance : lastBal;
    acc.push({ x: t.transactionDate, y });
    return acc;
  }, [] as ChartPoint[]);

  const visibleStart = input.visibleStart ?? pts[0].x;
  const visibleEnd = input.visibleEnd ?? pts[pts.length - 1].x;
  const effectiveMaxX = visibleEnd + paddingDays * msPerDay;

  const ticks: number[] = [];
  const range = effectiveMaxX - visibleStart;
  const step = tickCount > 1 ? range / (tickCount - 1) : 0;
  for (let i = 0; i < tickCount; i++) ticks.push(visibleStart + step * i);

  const dailyBalances: ChartPoint[] = [];
  let currentDayStart = new Date(pts[0].x).setHours(0, 0, 0, 0);
  const lastDayEnd = new Date(effectiveMaxX).setHours(23, 59, 59, 999);
  let lb = pts[0].y;
  let pi = 0;
  while (currentDayStart <= lastDayEnd) {
    const nds = currentDayStart + msPerDay;
    while (pi < pts.length && pts[pi].x < nds) {
      lb = pts[pi].y;
      pi++;
    }
    dailyBalances.push({ x: currentDayStart, y: lb });
    currentDayStart = nds;
  }

  const fullRolling = dailyBalances.map((db, i) => {
    let sum = 0;
    let count = 0;
    for (let j = 0; j < rollingWindowDays; j++) {
      if (i - j >= 0) {
        sum += dailyBalances[i - j].y;
        count++;
      }
    }
    return { x: db.x, y: count > 0 ? sum / count : 0 };
  });

  return {
    chartData: dailyBalances.filter(p => p.x >= visibleStart && p.x <= effectiveMaxX),
    rollingAverageData: fullRolling.filter(p => p.x >= visibleStart && p.x <= effectiveMaxX),
    xTicks: ticks,
  };
}
