export { PeopleReadService, peopleReadService } from './peopleReadService';
export {
  createPerson,
  updatePerson,
  renamePerson,
  setPersonArchived,
  softDeletePerson,
  linkExistingAccount,
  ensurePersonAccountInSession,
  ensurePersonAccount,
  type PersonProfileInput,
  type PersonProfilePatch,
} from './peopleLifecycleCommands';
export { saveSplitExpense, saveFriendPaidBill, recordPersonMovement } from './peopleSplitCommands';
export {
  autoSettlePerson,
  autoSettlePersonInSession,
  autoSettleTouchedPeople,
  recordRepayment,
  allocateUnassignedRepayment,
  executeWeAreSettled,
  type RepaymentAllocationInput,
  type RecordRepaymentInput,
  type AllocateUnassignedRepaymentInput,
  type ExecuteWeAreSettledInput,
} from './peopleSettlementCommands';
