import dayjs from 'dayjs';

export class TimeContext {
  private readonly now: dayjs.Dayjs;
  private readonly simulationDays: number;
  private readonly startOfToday: dayjs.Dayjs;
  private readonly endMs: number;

  constructor(now: dayjs.Dayjs, simulationDays: number) {
    this.now = now;
    this.simulationDays = simulationDays;
    this.startOfToday = now.startOf('day');
    this.endMs = this.startOfToday.add(simulationDays, 'day').valueOf();
  }

  getNow(): dayjs.Dayjs {
    return this.now;
  }

  getStartOfToday(): dayjs.Dayjs {
    return this.startOfToday;
  }

  getSimulationDays(): number {
    return this.simulationDays;
  }

  getEndMs(): number {
    return this.endMs;
  }

  getDayOffset(timestamp: number): number {
    return dayjs(timestamp).startOf('day').diff(this.startOfToday, 'day');
  }

  getTimestamp(dayOffset: number): number {
    return this.startOfToday.add(dayOffset, 'day').valueOf();
  }

  isFuture(timestamp: number): boolean {
    // We use a small 1-minute buffer to handle very recent entries consistently
    return dayjs(timestamp).isAfter(this.now.subtract(1, 'minute'));
  }

  isWithinSimulation(timestamp: number): boolean {
    const ts = typeof timestamp === 'number' ? timestamp : dayjs(timestamp).valueOf();
    return this.isFuture(ts) && ts <= this.endMs;
  }

  daysLeftInMonth(): number {
    return this.now.daysInMonth() - this.now.date() + 1;
  }

  nextMonthDays(): number {
    return this.now.add(1, 'month').daysInMonth();
  }
}
