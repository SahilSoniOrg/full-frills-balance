/**
 * Linux software-emulation runs set DETOX_JEST_TIMEOUT_MS.
 * Specs call jest.setTimeout with a shorter budget; keep the higher floor
 * so a slow launch can still reach assertions. This does not change assertions.
 */
const floor = Number(process.env.DETOX_JEST_TIMEOUT_MS || 0);
const jestApi = globalThis.jest;
if (floor > 0 && jestApi && typeof jestApi.setTimeout === 'function') {
  const original = jestApi.setTimeout.bind(jestApi);
  jestApi.setTimeout = ms => original(Math.max(Number(ms) || 0, floor));
  original(floor);
}
