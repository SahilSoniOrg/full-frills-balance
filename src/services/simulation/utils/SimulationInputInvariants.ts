/** Validates simulation inputs before any working state or projections are allocated. */
export function assertValidSimulationInputs(
  startingBalances: Map<string, number>,
  days: number,
  startDayOffset: number,
  startDayTimestamp: number,
): void {
  assertFiniteIntegerOrThrow(days, 'days');
  if (days < 0) {
    throwSimulationInputInvariant(`days must be non-negative; received ${days}`);
  }

  assertFiniteIntegerOrThrow(startDayOffset, 'startDayOffset');
  assertFiniteOrThrow(startDayTimestamp, 'startDayTimestamp');

  for (const [accountId, balance] of startingBalances.entries()) {
    if (!Number.isFinite(balance)) {
      throwSimulationInputInvariant(
        `starting balance for ${accountId} must be finite; received ${balance}`,
      );
    }
  }
}

function assertFiniteIntegerOrThrow(value: number, field: string): void {
  assertFiniteOrThrow(value, field);
  if (!Number.isInteger(value)) {
    throwSimulationInputInvariant(`${field} must be an integer; received ${value}`);
  }
}

function assertFiniteOrThrow(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throwSimulationInputInvariant(`${field} must be finite; received ${value}`);
  }
}

function throwSimulationInputInvariant(message: string): never {
  throw new Error(`[SimulationInputInvariant] ${message}`);
}
