import React, { createContext, useContext } from 'react';
import type { WorkplaceId } from '@/src/types/ids';
import type { PlainWorkplace } from '@/src/types/plainDtos';

export type CreationLaunchIntent = 'first_run' | 'add_workplace';
export type CreationLaunchEntryContext =
  | 'unregistered_device'
  | 'registered_empty_device'
  | 'workplace_picker'
  | 'existing_workplace_entry';

export interface CreationLaunchEntry {
  readonly intent: CreationLaunchIntent;
  readonly context: CreationLaunchEntryContext;
  readonly entryPolicy: 'blocking' | 'optional';
}

export interface CreationLaunchContextValue {
  readonly openCreatedWorkplace: (id: WorkplaceId) => Promise<void>;
  readonly returnToWorkplacePicker: () => void;
  readonly entry?: CreationLaunchEntry;
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

export interface CreationOpeningTarget {
  readonly id: WorkplaceId;
  readonly validatedWorkplace?: PlainWorkplace;
  readonly committed?: boolean;
}

export interface CreationOpeningCoordinatorValue {
  readonly target: CreationOpeningTarget | null;
  readonly request: (id: WorkplaceId) => void;
  readonly markValidated: (id: WorkplaceId, workplace: PlainWorkplace) => void;
  readonly markCommitted: (id: WorkplaceId) => void;
  readonly clear: (id: WorkplaceId) => void;
}

const CreationOpeningCoordinatorContext =
  createContext<CreationOpeningCoordinatorValue | undefined>(undefined);

export function CreationOpeningCoordinatorProvider({
  value,
  children,
}: {
  value: CreationOpeningCoordinatorValue;
  children: React.ReactNode;
}) {
  return (
    <CreationOpeningCoordinatorContext.Provider value={value}>
      {children}
    </CreationOpeningCoordinatorContext.Provider>
  );
}

export function useCreationOpeningCoordinator(): CreationOpeningCoordinatorValue {
  const value = useContext(CreationOpeningCoordinatorContext);
  if (!value) throw new Error('Creation opening must be coordinated by LaunchCoordinatorProvider');
  return value;
}
