import type { BalanceSimulationInput } from './balanceSimulation';
import type { SimulationEngineResult } from './types';
import { simulationAborted, throwIfSimulationAborted } from './simulationCancellation';

interface Request {
  input: BalanceSimulationInput;
  signal?: AbortSignal;
  resolve: (result: SimulationEngineResult) => void;
  reject: (error: unknown) => void;
  onAbort: () => void;
}

/** Dashboard has one current forecast: retain one running job and one latest pending job. */
export class LatestSimulationRunner {
  private running = false;
  private pending?: Request;

  constructor(
    private readonly execute: (input: BalanceSimulationInput) => Promise<SimulationEngineResult>,
  ) {}

  run(input: BalanceSimulationInput, signal?: AbortSignal): Promise<SimulationEngineResult> {
    throwIfSimulationAborted(signal);
    return new Promise((resolve, reject) => {
      const request: Request = {
        input,
        signal,
        resolve,
        reject,
        onAbort: () => {
          if (this.pending === request) this.pending = undefined;
          signal?.removeEventListener('abort', request.onAbort);
          reject(simulationAborted());
        },
      };
      signal?.addEventListener('abort', request.onAbort, { once: true });
      if (this.pending) {
        this.pending.signal?.removeEventListener('abort', this.pending.onAbort);
        this.pending.reject(simulationAborted());
      }
      this.pending = request;
      this.drain();
    });
  }

  private drain(): void {
    if (this.running || !this.pending) return;
    const request = this.pending;
    this.pending = undefined;
    this.running = true;
    void (async () => {
      try {
        throwIfSimulationAborted(request.signal);
        const result = await this.execute(request.input);
        throwIfSimulationAborted(request.signal);
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      } finally {
        request.signal?.removeEventListener('abort', request.onAbort);
        // Aborting rejects the caller immediately, but must not release the
        // worker slot until the actual native calculation has finished.
        this.running = false;
        this.drain();
      }
    })();
  }
}
