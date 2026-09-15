import { FlowCategory, FlowSource, type Flow } from '../types';
import { asAccountId } from '@/src/types/ids';
import { summarizeSimulationFlows } from './simulationFlowSummary';

describe('summarizeSimulationFlows', () => {
  it('summarizes liquid future income, planned outflow, and commitments', () => {
    const flows: Flow[] = [
      {
        kind: 'INFLOW',
        accountId: asAccountId('cash'),
        amount: 1000,
        dayOffset: 2,
        category: FlowCategory.INCOME,
        timeframe: 'FUTURE',
        label: 'Salary',
        origin: FlowSource.PLANNED_PAYMENT,
        referenceId: 'salary',
      },
      {
        kind: 'OUTFLOW',
        accountId: asAccountId('cash'),
        amount: 250,
        dayOffset: 4,
        category: FlowCategory.PLANNED_EXPENSE,
        timeframe: 'FUTURE',
        label: 'Rent',
        origin: FlowSource.PLANNED_PAYMENT,
        referenceId: 'rent',
      },
      {
        kind: 'OUTFLOW',
        accountId: asAccountId('cash'),
        amount: 75,
        dayOffset: 5,
        category: FlowCategory.BUDGET,
        timeframe: 'FUTURE',
        label: 'Groceries',
        origin: FlowSource.BUDGET,
        referenceId: 'groceries',
      },
      {
        kind: 'TRANSFER',
        fromAccountId: asAccountId('cash'),
        toAccountId: asAccountId('savings'),
        amount: 125,
        dayOffset: 6,
        category: FlowCategory.TRANSFER,
        timeframe: 'FUTURE',
        label: 'Emergency fund',
        origin: FlowSource.PLANNED_JOURNAL,
        referenceId: 'savings',
      },
      {
        kind: 'INFLOW',
        accountId: asAccountId('external'),
        amount: 500,
        dayOffset: 7,
        category: FlowCategory.INCOME,
        timeframe: 'FUTURE',
        label: 'Untracked income',
        origin: FlowSource.PLANNED_PAYMENT,
        referenceId: 'external-income',
      },
    ];

    expect(summarizeSimulationFlows(flows, new Set([asAccountId('cash')]))).toEqual({
      totalFutureInflow: 1000,
      totalPlannedOutflow: 250,
      totalCommittedPlanned: 450,
    });
  });
});
