/** Cancellation is control flow, never an unavailable financial forecast. */
export function simulationAborted(): Error {
  const error = new Error('Simulation superseded or cancelled');
  error.name = 'AbortError';
  return error;
}

export function throwIfSimulationAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw simulationAborted();
}
