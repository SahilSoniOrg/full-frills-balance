import { AppConfig } from '@/src/constants/app-config';
import { logger } from '@/src/utils/logger';
import { Trace, startTrace } from '@/src/utils/TraceService';
import type { Flow, SimulationEngineResult } from './types';
import { runBalanceSimulation } from './balanceSimulation';

export class Simulator {
  static simulate(
    startingBalances: Map<string, number>,
    flows: Flow[],
    days: number,
    liquidAccountIds: Set<string>,
    orderedLiquidAccountIds: string[] = [],
    startDayOffset: number = 0,
    startDayTimestamp: number = Date.now(),
    parentTrace?: Trace,
    precision = AppConfig.constants.precision,
  ): SimulationEngineResult {
    const trace = parentTrace || startTrace('Simulator.simulate');
    try {
      return runBalanceSimulation({
        startingBalances,
        flows,
        days,
        liquidAccountIds,
        orderedLiquidAccountIds,
        startDayOffset,
        startDayTimestamp,
        precision,
        majorInflowThreshold: AppConfig.defaults.simulation.majorInflowThreshold,
        financialEpsilon: AppConfig.defaults.simulation.financialEpsilon,
      });
    } catch (error) {
      logger.error('Simulator failure:', error);
      throw error;
    } finally {
      if (!parentTrace) trace.end();
    }
  }
}
