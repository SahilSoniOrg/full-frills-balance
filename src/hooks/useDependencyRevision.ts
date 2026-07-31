import { DependencyList, useLayoutEffect, useRef, useState } from 'react';

export function areDependencyListsEqual(oldDeps: DependencyList, newDeps: DependencyList): boolean {
  if (oldDeps.length !== newDeps.length) return false;
  return oldDeps.every((dep, i) => dep === newDeps[i]);
}

/**
 * Bumps a revision when `deps` change (by reference equality per slot).
 * Updates run in useLayoutEffect so we never setState during render.
 */
export function useDependencyRevision(deps: DependencyList, onRevision?: () => void): number {
  const depsRef = useRef(deps);
  const [revision, setRevision] = useState(0);
  const onRevisionRef = useRef(onRevision);
  useLayoutEffect(() => {
    onRevisionRef.current = onRevision;
  });

  // Intentionally has no dependency array: callers may provide a freshly-built list,
  // while this hook compares its slots to decide whether a revision is warranted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!areDependencyListsEqual(depsRef.current, deps)) {
      depsRef.current = deps;
      setRevision(r => r + 1);
      onRevisionRef.current?.();
    }
  });

  return revision;
}
