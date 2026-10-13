// The app shell publishes its existing lock policy. Absence of a mounted shell fails closed.
let allowed = false;
const listeners = new Set<(allowed: boolean) => void>();
export function setKeyAccessAllowed(value: boolean): void {
  if (allowed === value) return;
  allowed = value;
  for (const listener of listeners) listener(value);
}
export function subscribeKeyAccessPolicy(listener: (allowed: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function assertKeyAccessAllowed(): void {
  if (!allowed) throw new Error('Unlock the app before accessing encryption keys');
}
