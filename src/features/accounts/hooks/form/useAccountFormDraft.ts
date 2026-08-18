import type {
  AccountFields as Account,
  PlainAccountMetadata as AccountMetadata,
} from '@/src/types/domain';
import {
  AccountFormDraftAction,
  AccountFormDraftState,
  accountFormDraftReducer,
  coreFromDefaults,
  createAccountFormDraft,
  mapAccountToCoreDraft,
  mapBalanceToDraftBalance,
  mapMetadataToDraft,
  shouldSeedAccountBalanceDraft,
  shouldSeedAccountCoreDraft,
  shouldSeedAccountMetadataDraft,
} from '@/src/features/accounts/hooks/accountFormDraft';
import {
  AccountFormDefaults,
  AccountFormRouteContext,
} from '@/src/features/accounts/services/accountFormService';
import { AccountId } from '@/src/types/domain';
import { Dispatch, useReducer } from 'react';

export type AccountFormDraftDispatch = Dispatch<AccountFormDraftAction>;

/**
 * Owns the id-keyed account form draft reducer and one-shot seeding from observe.
 */
export function useAccountFormDraft(args: {
  accountId: AccountId | undefined;
  existingAccount: Account | null | undefined;
  balanceData: { balance: number } | null | undefined;
  existingMetadata: AccountMetadata | undefined;
  routeContext: AccountFormRouteContext;
  workplaceCurrency: string;
  createFormDefaults: AccountFormDefaults;
}): { draft: AccountFormDraftState; dispatch: AccountFormDraftDispatch } {
  const {
    accountId,
    existingAccount,
    balanceData,
    existingMetadata,
    routeContext,
    workplaceCurrency,
    createFormDefaults,
  } = args;

  const [draft, dispatch] = useReducer(
    accountFormDraftReducer,
    createFormDefaults,
    createAccountFormDraft,
  );

  const { seededAccountId, seededBalanceAccountId, seededMetadataAccountId } = draft;

  // Seed once per entity id during render — never on every observe tick.
  // One dispatch per render (React discards + re-renders on mid-render setState).
  const canSeedCore = shouldSeedAccountCoreDraft({
    accountId,
    seededAccountId,
    existingAccount,
  });
  const canSeedBalance = shouldSeedAccountBalanceDraft({
    accountId,
    seededBalanceAccountId,
    balanceData,
  });
  const canSeedMetadata = shouldSeedAccountMetadataDraft({
    accountId,
    seededMetadataAccountId,
    existingMetadata,
  });

  if (canSeedCore && existingAccount && accountId) {
    dispatch({
      type: 'SEED_EDIT_CORE',
      accountId,
      core: mapAccountToCoreDraft(existingAccount, routeContext, workplaceCurrency),
    });
  } else if (!accountId && seededAccountId !== null) {
    dispatch({ type: 'SEED_CREATE', core: coreFromDefaults(createFormDefaults) });
  } else if (canSeedBalance && accountId && balanceData) {
    dispatch({
      type: 'SEED_BALANCE',
      accountId,
      initialBalance: mapBalanceToDraftBalance(balanceData),
    });
  } else if (canSeedMetadata && accountId && existingMetadata) {
    dispatch({
      type: 'SEED_METADATA',
      accountId,
      metadata: mapMetadataToDraft(existingMetadata),
    });
  }

  return { draft, dispatch };
}
