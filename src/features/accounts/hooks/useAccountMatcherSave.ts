import {
  AccountMatcherConflictError,
  AccountMatcherProposalUnavailableError,
  forgetAccountMatcher,
  saveAccountMatcher,
} from '@/src/services/accounts/accountMatcherCommands';
import type { AccountMatcherDefinitionV1 } from '@/src/types/accountMatcher';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { useBoundWorkplaceSaveGate } from '@/src/navigation/boundWorkplace';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { useCallback, useRef, useState } from 'react';

export type AccountMatcherSaveResult = 'saved' | 'invalid' | 'overlap' | 'error';

export function useAccountMatcherSave(args: {
  workplaceId: WorkplaceId;
  accountId: AccountId;
  matcherId?: string;
  proposalKey?: string;
  definition: AccountMatcherDefinitionV1;
  validationValid: boolean;
  overlapCount: number;
  selectedExampleId?: string;
  provenance: 'discovered' | 'selected_message' | 'manual';
}) {
  const { assertBound } = useBoundWorkplaceSaveGate();
  const inFlight = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useCallback(
    async (resolution?: {
      keepBoth?: boolean;
      moveMatcherId?: string;
    }): Promise<AccountMatcherSaveResult> => {
      if (inFlight.current) return 'error';
      if (!args.validationValid) return 'invalid';
      if (args.overlapCount && !resolution) return 'overlap';
      inFlight.current = true;
      setSaveError(null);
      setIsSaving(true);
      try {
        assertBound();
        await saveAccountMatcher(args.workplaceId, {
          ...(args.matcherId ? { id: args.matcherId } : {}),
          accountId: args.accountId,
          definition: args.definition,
          ...(args.proposalKey ? { proposalKey: args.proposalKey } : {}),
          ...(!args.matcherId ? { provenance: args.provenance } : {}),
          ...(resolution?.moveMatcherId ? { moveMatcherId: resolution.moveMatcherId } : {}),
        });
        return 'saved';
      } catch (error) {
        setSaveError(
          error instanceof AccountMatcherConflictError
            ? copy.duplicateMatcher
            : error instanceof AccountMatcherProposalUnavailableError
              ? copy.proposalUnavailable
              : copy.saveError,
        );
        return 'error';
      } finally {
        inFlight.current = false;
        setIsSaving(false);
      }
    },
    [
      args.accountId,
      args.definition,
      args.matcherId,
      args.overlapCount,
      args.proposalKey,
      args.provenance,
      args.validationValid,
      args.workplaceId,
      assertBound,
    ],
  );

  const forget = useCallback(async () => {
    if (!args.matcherId || inFlight.current) return false;
    inFlight.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      assertBound();
      await forgetAccountMatcher(args.workplaceId, args.matcherId);
      return true;
    } catch {
      setSaveError(copy.forgetError);
      return false;
    } finally {
      inFlight.current = false;
      setIsSaving(false);
    }
  }, [args.matcherId, args.workplaceId, assertBound]);

  return { isSaving, saveError, setSaveError, save, forget };
}
