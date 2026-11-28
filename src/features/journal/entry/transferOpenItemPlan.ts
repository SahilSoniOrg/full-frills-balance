import type { AccountId, OpenItemId, PersonId } from '@/src/types/ids';

export type RepaymentAllocationMode = 'fifo' | 'pick';

/** Open-item allocation chosen in the transfer editor and handed to the save pipeline. */
export type TransferOpenItemPlan = {
  personId: PersonId;
  targetAccountId: AccountId;
  allocationMode: RepaymentAllocationMode;
  allocations: readonly { openItemId: OpenItemId; amount: number }[];
};
