import { useCallback } from 'react';
import { accountFormStrings as copy } from '@/src/constants/copy/domains/accountFormStrings';
import {
  getAccountCarouselKinds,
  getAccountKind,
  isCarouselAccountType,
  resolveAccountKindPresentation,
  suggestAccountKind,
  type AccountKind,
  type SuggestedAccountKind,
} from '@/src/features/accounts/helpers/accountKinds';
import type { AccountFormCoreDraft } from '@/src/features/accounts/hooks/accountFormDraft';
import type { AccountFormDraftDispatch } from './useAccountFormDraft';

export interface AccountFormKindApi {
  kindTouched: boolean;
  selectKindKey: (key: string) => void;
  kindSuggestionMessage: string | null;
  kindLabel: string | null;
  kindSuggestion: SuggestedAccountKind | null;
  setAccountKind: (value: SuggestedAccountKind) => void;
  acceptKindSuggestion: () => void;
  dismissKindSuggestion: () => void;
  carouselKinds: readonly AccountKind[];
  selectedKindKey: string | null;
  balanceLabel: string;
  submitLabel: string;
  typeTone: 'asset' | 'liability' | 'neutral';
  detailsSection: 'credit_card' | 'loan' | null;
}

/** Account-kind logic shares the existing draft's seeding and reset lifecycle. */
export function useAccountFormKind(args: {
  core: AccountFormCoreDraft;
  dispatch: AccountFormDraftDispatch;
  isEditMode: boolean;
  hasSubtypeRouteParam: boolean;
  canChangeKind?: boolean;
}): AccountFormKindApi {
  const { core, dispatch, isEditMode, hasSubtypeRouteParam, canChangeKind = true } = args;
  const { accountType, accountSubtype, accountName, kindTouched, dismissedKindSuggestion } = core;
  const suggestion = suggestAccountKind(accountName, {
    type: accountType,
    subtype: accountSubtype,
  });
  const isDismissed =
    suggestion &&
    dismissedKindSuggestion &&
    suggestion.type === dismissedKindSuggestion.type &&
    suggestion.subtype === dismissedKindSuggestion.subtype;
  const kindSuggestion =
    isCarouselAccountType(accountType) &&
    !kindTouched &&
    !isEditMode &&
    !hasSubtypeRouteParam &&
    canChangeKind &&
    !isDismissed
      ? suggestion
      : null;

  const setAccountKind = useCallback(
    (value: SuggestedAccountKind) => {
      if (!canChangeKind) return;
      dispatch({
        type: 'SET_ACCOUNT_KIND',
        accountType: value.type,
        accountSubtype: value.subtype,
      });
    },
    [dispatch, canChangeKind],
  );
  const acceptKindSuggestion = useCallback(() => {
    if (kindSuggestion) setAccountKind(kindSuggestion);
  }, [kindSuggestion, setAccountKind]);
  const dismissKindSuggestion = useCallback(() => {
    if (kindSuggestion) dispatch({ type: 'DISMISS_KIND_SUGGESTION', suggestion: kindSuggestion });
  }, [kindSuggestion, dispatch]);

  const selectedKind = getAccountKind(accountType, accountSubtype);
  const carouselKinds = getAccountCarouselKinds(accountType, accountSubtype)
    .filter(kind => canChangeKind || kind.key === selectedKind?.key)
    .map(kind => (kind.key === selectedKind?.key ? { ...kind, icon: core.selectedIcon } : kind));
  const selectKindKey = useCallback(
    (key: string) => {
      const selected = carouselKinds.find(kind => kind.key === key);
      if (selected) setAccountKind(selected);
    },
    [carouselKinds, setAccountKind],
  );

  return {
    kindTouched,
    selectKindKey,
    kindLabel: selectedKind?.label ?? null,
    kindSuggestionMessage: kindSuggestion
      ? copy.suggestion(
          getAccountKind(kindSuggestion.type, kindSuggestion.subtype)!.label.toLowerCase(),
        )
      : null,
    kindSuggestion,
    setAccountKind,
    acceptKindSuggestion,
    dismissKindSuggestion,
    carouselKinds,
    selectedKindKey: getAccountKind(accountType, accountSubtype)?.key ?? null,
    ...resolveAccountKindPresentation(accountType, accountSubtype, isEditMode),
  };
}
