import React, { createContext, useContext } from 'react';
import type { WorkplaceId } from '@/src/types/ids';

export interface CreationLaunchContextValue {
  openCreatedWorkplace(id: WorkplaceId): Promise<void>;
}

const CreationLaunchContext = createContext<CreationLaunchContextValue | undefined>(undefined);

export function CreationLaunchProvider({
  value,
  children,
}: {
  value: CreationLaunchContextValue;
  children: React.ReactNode;
}) {
  return <CreationLaunchContext.Provider value={value}>{children}</CreationLaunchContext.Provider>;
}

export function useCreationLaunch(): CreationLaunchContextValue {
  const value = useContext(CreationLaunchContext);
  if (!value) throw new Error('useCreationLaunch must be used within CreationLaunchProvider');
  return value;
}