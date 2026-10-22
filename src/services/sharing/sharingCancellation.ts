/** React Native's AbortSignal polyfill does not implement throwIfAborted(). */
export function throwIfShareAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const error = new Error('Sharing was cancelled');
  error.name = 'AbortError';
  throw error;
}

export function isShareCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}
