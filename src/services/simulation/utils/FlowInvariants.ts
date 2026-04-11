import { Flow, FlowCategory } from '../types';
import { assertPolicyInvariants } from './FlowPolicyValidator';

/**
 * Ensures that a Flow object adheres to core domain invariants.
 * Acts as the primary entry point for generator-level validation.
 */
export function assertValidFlow(flow: Flow): void {
  assertHardInvariants(flow);
  assertPolicyInvariants(flow, throwInvariant);
}

/**
 * Validates 'HARD' structural invariants that must never be violated.
 * These rules protect the technical integrity of the simulation engine.
 */
export function assertHardInvariants(flow: Flow): void {
  // 1. Structural Presence
  if (!flow.label) throwInvariant('Flow is missing label', flow);
  if (!flow.origin) throwInvariant('Flow is missing origin', flow);
  if (!flow.referenceId) throwInvariant('Flow is missing referenceId', flow);

  // 2. Amount Integrity
  if (flow.amount < 0) {
    throwInvariant(`Negative amount found: ${flow.amount}`, flow);
  }

  // 3. Time Consistency
  if (flow.dayOffset < 0 && flow.timeframe !== 'PAST') {
    throwInvariant(`Past dayOffset (${flow.dayOffset}) must have timeframe 'PAST'`, flow);
  }
  if (flow.dayOffset >= 0 && flow.timeframe !== 'FUTURE') {
    throwInvariant(`Future dayOffset (${flow.dayOffset}) must have timeframe 'FUTURE'`, flow);
  }

  // 4. Kind-Specific & Account Integrity
  if (flow.kind === 'TRANSFER') {
    if (!flow.fromAccountId || !flow.toAccountId) {
      throwInvariant('Transfer flow is missing src/dest accounts', flow);
    }
    if (flow.fromAccountId === flow.toAccountId) {
      throwInvariant(`Self-transfer detected: ${flow.fromAccountId} -> ${flow.toAccountId}`, flow);
    }
  } else {
    // INFLOW or OUTFLOW
    if (!flow.accountId) {
      throwInvariant(`${flow.kind} flow is missing accountId`, flow);
    }
  }

  // 5. Category-Kind Logical Core Alignment
  if (flow.category === FlowCategory.BUDGET && flow.kind !== 'OUTFLOW') {
    throwInvariant('BUDGET category must always be an OUTFLOW kind', flow);
  }
  if (flow.category === FlowCategory.INCOME && flow.kind !== 'INFLOW') {
    throwInvariant('INCOME category must always be an INFLOW kind', flow);
  }
  if (flow.kind === 'TRANSFER') {
    if (flow.category !== FlowCategory.TRANSFER && flow.category !== FlowCategory.DEBT) {
      throwInvariant('TRANSFER kind must have category TRANSFER or DEBT', flow);
    }
  }
}

/**
 * Helper to throw formatted invariant errors with rich debug context.
 */
function throwInvariant(message: string, flow: Flow): never {
  const context = JSON.stringify(
    {
      kind: flow.kind,
      category: flow.category,
      origin: flow.origin,
      label: flow.label,
      amount: flow.amount,
      dayOffset: flow.dayOffset,
      referenceId: flow.referenceId,
      resolvedFrom: flow.resolvedFrom,
      accountId: flow.kind !== 'TRANSFER' ? flow.accountId : undefined,
      from: flow.kind === 'TRANSFER' ? flow.fromAccountId : undefined,
      to: flow.kind === 'TRANSFER' ? flow.toAccountId : undefined,
    },
    null,
    2,
  );

  throw new Error(`[FlowInvariant] ${message}\nContext: ${context}`);
}
