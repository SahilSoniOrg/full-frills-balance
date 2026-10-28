import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type CommitmentBadgeKey = 'budgets' | 'planned';
type CommitmentBadgeValue = {
  counts: Readonly<Record<CommitmentBadgeKey, number | null>>;
  updateCount: (key: CommitmentBadgeKey, count: number) => void;
};

const CommitmentsBadgeContext = createContext<CommitmentBadgeValue | null>(null);

/** Holds the last active-page count for the shared subtab strip without a second read pipeline. */
export function CommitmentsGroupProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<Record<CommitmentBadgeKey, number | null>>({
    budgets: null,
    planned: null,
  });
  const updateCount = useCallback((key: CommitmentBadgeKey, count: number) => {
    setCounts(previous => (previous[key] === count ? previous : { ...previous, [key]: count }));
  }, []);
  const value = useMemo(() => ({ counts, updateCount }), [counts, updateCount]);
  return (
    <CommitmentsBadgeContext.Provider value={value}>{children}</CommitmentsBadgeContext.Provider>
  );
}

export function useCommitmentsBadgeSnapshot(): CommitmentBadgeValue {
  const value = useContext(CommitmentsBadgeContext);
  if (!value)
    throw new Error('useCommitmentsBadgeSnapshot must be used within CommitmentsGroupProvider');
  return value;
}
