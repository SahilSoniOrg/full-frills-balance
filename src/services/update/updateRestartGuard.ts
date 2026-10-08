const blockers = new Set<symbol>();

/** Editors register their existing dirty/save state; drafts stay owned by their form. */
export function blockUpdateRestart(): () => void {
  const key = Symbol();
  blockers.add(key);
  return () => {
    blockers.delete(key);
  };
}

export function isUpdateRestartBlocked(): boolean {
  return blockers.size > 0;
}
