import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { Fragment, type ReactNode } from 'react';

/** Remounts workplace-local content when the committed workplace changes. */
export function RemountOnWorkplace({ children }: { children: ReactNode }) {
  const workplaceId = useOptionalWorkplace()?.workplaceId;
  return <Fragment key={workplaceId}>{children}</Fragment>;
}
