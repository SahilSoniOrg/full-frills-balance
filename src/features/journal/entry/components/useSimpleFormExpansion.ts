import { useEaseInLayoutAnimation } from '@/src/hooks/useEaseInLayoutAnimation';
import type { AccountRole, TabType } from '@/src/types/domainJournal';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import { useCallback, useState } from 'react';
import type { ExpansionPosition } from './SimpleFormAccountSections';

interface UseSimpleFormExpansionInput {
  type: TabType;
  sourceId: AccountId;
  destinationId: AccountId;
  autopilotFirstRole?: AccountRole;
  onSelectSource: (id: AccountId) => void;
  onSelectDestination: (id: AccountId) => void;
}

export type AutopilotAppliedAccount = {
  role: AccountRole;
  id: AccountId;
};

export type AccountFlowHandle = {
  start: (applied?: AutopilotAppliedAccount) => void;
};

function isAccountSet(id: AccountId | undefined): boolean {
  return Boolean(id && id !== EMPTY_ACCOUNT_ID);
}

export function resolveAutopilotExpansion(input: {
  type: TabType;
  sourceId: AccountId;
  destinationId: AccountId;
  firstRole?: AccountRole;
}): { expansionPosition: ExpansionPosition; autopilotNextRole: AccountRole | null } {
  const firstRole = input.firstRole ?? (input.type === 'expense' ? 'destination' : 'source');
  const secondRole: AccountRole = firstRole === 'source' ? 'destination' : 'source';
  const firstId = firstRole === 'source' ? input.sourceId : input.destinationId;
  const secondId = firstRole === 'source' ? input.destinationId : input.sourceId;

  if (!isAccountSet(firstId)) {
    return {
      expansionPosition: firstRole === 'source' ? 'left' : 'right',
      autopilotNextRole: isAccountSet(secondId) ? null : secondRole,
    };
  }
  if (!isAccountSet(secondId)) {
    return {
      expansionPosition: secondRole === 'source' ? 'left' : 'right',
      autopilotNextRole: null,
    };
  }
  return { expansionPosition: null, autopilotNextRole: null };
}

export function useSimpleFormExpansion({
  type,
  sourceId,
  destinationId,
  autopilotFirstRole,
  onSelectSource,
  onSelectDestination,
}: UseSimpleFormExpansionInput) {
  const prepareLayoutAnimation = useEaseInLayoutAnimation();
  const [expansionPosition, setExpansionPosition] = useState<ExpansionPosition>(() => {
    if (sourceId && destinationId) return null;
    return type === 'expense' ? 'right' : 'left';
  });
  const [autopilotNextRole, setAutopilotNextRole] = useState<AccountRole | null>(null);

  const startAutopilotAccountFlow = useCallback(
    (applied?: AutopilotAppliedAccount) => {
      const next = resolveAutopilotExpansion({
        type,
        sourceId: applied?.role === 'source' ? applied.id : sourceId,
        destinationId: applied?.role === 'destination' ? applied.id : destinationId,
        firstRole: autopilotFirstRole,
      });
      prepareLayoutAnimation();
      setExpansionPosition(next.expansionPosition);
      setAutopilotNextRole(next.autopilotNextRole);
    },
    [autopilotFirstRole, destinationId, prepareLayoutAnimation, sourceId, type],
  );

  const handleToggleExpansion = useCallback(
    (side: 'left' | 'right') => {
      prepareLayoutAnimation();
      setExpansionPosition(previous => (previous === side ? null : side));
    },
    [prepareLayoutAnimation],
  );

  const handleSelectSource = useCallback(
    (id: AccountId) => {
      onSelectSource(id);
      if (id && id !== EMPTY_ACCOUNT_ID) {
        const shouldAdvance = autopilotNextRole === 'destination' && !isAccountSet(destinationId);
        prepareLayoutAnimation();
        setExpansionPosition(shouldAdvance ? 'right' : null);
        setAutopilotNextRole(null);
      }
    },
    [autopilotNextRole, destinationId, onSelectSource, prepareLayoutAnimation],
  );

  const handleSelectDestination = useCallback(
    (id: AccountId) => {
      onSelectDestination(id);
      if (id && id !== EMPTY_ACCOUNT_ID) {
        const shouldAdvance = autopilotNextRole === 'source' && !isAccountSet(sourceId);
        prepareLayoutAnimation();
        setExpansionPosition(shouldAdvance ? 'left' : null);
        setAutopilotNextRole(null);
      }
    },
    [autopilotNextRole, onSelectDestination, prepareLayoutAnimation, sourceId],
  );

  return {
    expansionPosition,
    handleSelectDestination,
    handleSelectSource,
    handleToggleExpansion,
    startAutopilotAccountFlow,
  };
}
