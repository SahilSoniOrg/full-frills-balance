const noop = () => {};
const mockProxy: any = new Proxy(
  {},
  {
    get: (target, prop) => {
      // Return a function that returns the proxy to allow chaining of method calls/accesses without throwing.
      return () => mockProxy;
    },
  },
);

export const NitroModules = mockProxy;

export function isRuntimeAlive(): boolean {
  return false;
}
