const mockProxy: Record<string, unknown> = new Proxy(
  {},
  {
    get: (_target, _prop) => {
      // Return a function that returns the proxy to allow chaining of method calls/accesses without throwing.
      return () => mockProxy;
    },
  },
);

export const NitroModules = mockProxy;

export function isRuntimeAlive(): boolean {
  return false;
}
