import AccountMetadata from '@/src/data/models/AccountMetadata';
import {
  AccountMetadataValues,
  createDefaultAccountMetadataValues,
} from '@/src/features/accounts/services/accountMetadataDomain';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAccountMetadataFormResult {
  values: AccountMetadataValues;
  updateField: <K extends keyof AccountMetadataValues>(
    key: K,
    value: AccountMetadataValues[K],
  ) => void;
}

/**
 * Manages the consolidated AccountMetadata form state.
 * Handles one-time injection from the existing DB record and exposes a single generic
 * field updater instead of per-field useState pairs.
 */
export function useAccountMetadataForm(
  existingMetadata: AccountMetadata | undefined,
  onFieldChange?: () => void,
): UseAccountMetadataFormResult {
  const [values, setValues] = useState<AccountMetadataValues>(() =>
    createDefaultAccountMetadataValues(null),
  );
  const hasInjectedRef = useRef(false);

  useEffect(() => {
    if (existingMetadata && !hasInjectedRef.current) {
      hasInjectedRef.current = true;
      setValues(createDefaultAccountMetadataValues(existingMetadata));
    }
  }, [existingMetadata]);

  const updateField = useCallback(
    <K extends keyof AccountMetadataValues>(key: K, value: AccountMetadataValues[K]) => {
      setValues(prev => ({ ...prev, [key]: value }));
      onFieldChange?.();
    },
    [onFieldChange],
  );

  return { values, updateField };
}
