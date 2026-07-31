import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { SmsRuleCondition, SmsRuleMode } from '@/src/services/ledger/RuleMatcher';
import {
  buildSmsRulePreviewInput,
  smsRulePreviewHasConditions,
} from '@/src/services/sms/smsRuleFormPolicy';
import { smsService } from '@/src/services/sms-service';
import { useEffect, useMemo, useState } from 'react';

export function useSmsRulePreview(
  mode: SmsRuleMode,
  structuredConditions: SmsRuleCondition[],
  legacySenderMatch: string,
  legacyBodyMatch: string,
): TransactionInboxRecord[] {
  const [previewMatches, setPreviewMatches] = useState<TransactionInboxRecord[]>([]);
  const hasConditions = smsRulePreviewHasConditions(mode, structuredConditions, legacySenderMatch);

  useEffect(() => {
    let active = true;
    const input = buildSmsRulePreviewInput(
      mode,
      structuredConditions,
      legacySenderMatch,
      legacyBodyMatch,
    );

    if (!hasConditions) {
      return () => {
        active = false;
      };
    }

    smsService
      .previewRuleMatches(input)
      .then(matches => {
        if (active) setPreviewMatches(matches);
      })
      .catch(() => {
        if (active) setPreviewMatches([]);
      });

    return () => {
      active = false;
    };
  }, [hasConditions, legacyBodyMatch, legacySenderMatch, mode, structuredConditions]);

  return useMemo(() => (hasConditions ? previewMatches : []), [hasConditions, previewMatches]);
}
