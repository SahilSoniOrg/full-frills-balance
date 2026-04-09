import { AppConfig } from '@/src/constants/app-config';
import { cashFlowSimulationService } from './CashFlowSimulationService';
import { ISimulationService } from './types';
import { simulationV2Adapter } from './v2/SimulationV2Adapter';

export class SimulationProvider {
  getService(): ISimulationService {
    if (AppConfig.features.enableSimulationV2) {
      return simulationV2Adapter;
    }
    return cashFlowSimulationService;
  }
}

export const simulationProvider = new SimulationProvider();
