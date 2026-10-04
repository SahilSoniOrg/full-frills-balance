import dayjs from 'dayjs';

export type SimulationTimeWindow = {
  getStartOfToday(): dayjs.Dayjs;
  getEndMs(): number;
};

export function createSimulationTimeWindow(
  now: dayjs.Dayjs,
  simulationDays: number,
): SimulationTimeWindow {
  const startOfToday = now.startOf('day');
  const endMs = startOfToday.add(simulationDays, 'day').valueOf();
  return {
    getStartOfToday: () => startOfToday,
    getEndMs: () => endMs,
  };
}
