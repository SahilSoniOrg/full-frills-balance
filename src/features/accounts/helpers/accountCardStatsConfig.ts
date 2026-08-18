import { AccountType } from '@/src/types/domain';

type FlowSide = 'increase' | 'decrease';

interface CardFlowConfig {
  left: FlowSide;
  leftLabel: string;
  rightLabel: string;
}

const CARD_FLOW: Record<AccountType, CardFlowConfig> = {
  [AccountType.ASSET]: {
    left: 'increase',
    leftLabel: 'MONEY IN',
    rightLabel: 'MONEY OUT',
  },
  [AccountType.EXPENSE]: {
    left: 'increase',
    leftLabel: 'MONTH SPENT',
    rightLabel: 'REFUNDS / CREDITS',
  },
  [AccountType.INCOME]: {
    left: 'increase',
    leftLabel: 'MONTH EARNED',
    rightLabel: 'ADJUSTMENTS',
  },
  [AccountType.EQUITY]: {
    left: 'increase',
    leftLabel: 'ADDITIONS',
    rightLabel: 'REDUCTIONS',
  },
  [AccountType.LIABILITY]: {
    left: 'decrease',
    leftLabel: 'PAYMENTS MADE',
    rightLabel: 'NEW CHARGES',
  },
};

const DEFAULT_CARD_FLOW = CARD_FLOW[AccountType.ASSET];

export function getAccountStatsConfig(
  accountType: AccountType | undefined,
  increase: number,
  decrease: number,
) {
  const config = accountType ? (CARD_FLOW[accountType] ?? DEFAULT_CARD_FLOW) : DEFAULT_CARD_FLOW;
  const leftAmount = config.left === 'increase' ? increase : decrease;
  const rightAmount = config.left === 'increase' ? decrease : increase;

  return {
    leftLabel: config.leftLabel,
    leftAmount,
    rightLabel: config.rightLabel,
    rightAmount,
  };
}
