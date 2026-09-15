import dayjs from 'dayjs';

export class TimeContext {
  private readonly startOfToday: dayjs.Dayjs;
  private readonly endMs: number;

  constructor(now: dayjs.Dayjs, simulationDays: number) {
    this.startOfToday = now.startOf('day');
    this.endMs = this.startOfToday.add(simulationDays, 'day').valueOf();
  }

  getStartOfToday(): dayjs.Dayjs {
    return this.startOfToday;
  }

  getEndMs(): number {
    return this.endMs;
  }
}
