import { PlainInboxRecord, WorkplaceId } from '@/src/types/domain';
import { SmsRuleCondition, SmsRuleMode } from '@/src/utils/sms/RuleMatcher';
import {
  buildSmsRulePreviewInput,
  smsRulePreviewHasConditions,
} from '@/src/services/sms/smsRuleFormPolicy';
import { smsService } from '@/src/services/sms-service';
import { useEffect, useMemo, useState } from 'react';

export function useSmsRulePreview(
  workplaceId: WorkplaceId,
  mode: SmsRuleMode,
  structuredConditions: SmsRuleCondition[],
  legacySenderMatch: string,
  legacyBodyMatch: string,
): PlainInboxRecord[] {
  const [previewMatches, setPreviewMatches] = useState<PlainInboxRecord[]>([]);
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
      .previewRuleMatches(workplaceId, input)
      .then(matches => {
        if (active) setPreviewMatches(matches);
      })
      .catch(() => {
        if (active) setPreviewMatches([]);
      });

    return () => {
      active = false;
    };
  }, [hasConditions, legacyBodyMatch, legacySenderMatch, mode, structuredConditions, workplaceId]);

  return useMemo(() => (hasConditions ? previewMatches : []), [hasConditions, previewMatches]);
}
