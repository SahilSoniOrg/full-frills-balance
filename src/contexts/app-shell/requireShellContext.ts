export function requireShellContext<T>(value: T | undefined, hookName: string): T {
  if (value === undefined) {
    throw new Error(`${hookName} must be used within a UIProvider`);
  }
  return value;
}
