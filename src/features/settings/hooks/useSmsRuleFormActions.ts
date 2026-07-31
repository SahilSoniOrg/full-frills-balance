import { analytics } from '@/src/services/analytics-service';
import { SmsRuleDisposition, SmsRuleMode } from '@/src/services/ledger/RuleMatcher';
import { smsService } from '@/src/services/sms-service';
import { validateSmsRuleRegexPatterns } from '@/src/services/sms/smsRuleFormPolicy';
import { AccountId, WorkplaceId } from '@/src/types/domain';
import { toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';

interface UseSmsRuleFormActionsProps {
  id?: string;
  workplaceId: WorkplaceId;
  isValid: boolean;
  mode: SmsRuleMode;
  legacySenderMatch: string;
  legacyBodyMatch: string;
  structuredConditions: ReturnType<
    typeof import('@/src/services/sms/smsRuleFormPolicy').buildStructuredSmsRuleConditions
  >;
  disposition: SmsRuleDisposition;
  sourceAccountId: AccountId;
  categoryAccountId: AccountId;
  journalDescription: string;
  isActive: boolean;
  priorityNumber: number;
  showAccountMapping: boolean;
}

export function useSmsRuleFormActions({
  id,
  workplaceId,
  isValid,
  mode,
  legacySenderMatch,
  legacyBodyMatch,
  structuredConditions,
  disposition,
  sourceAccountId,
  categoryAccountId,
  journalDescription,
  isActive,
  priorityNumber,
  showAccountMapping,
}: UseSmsRuleFormActionsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = useCallback(async () => {
    if (!isValid) return;
    if (mode === 'regex' && !validateSmsRuleRegexPatterns(legacySenderMatch, legacyBodyMatch)) {
      toast.error('Invalid regex syntax in advanced match fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await smsService.saveAutoPostRule(
        {
          id,
          mode,
          senderMatch: legacySenderMatch.trim() || undefined,
          bodyMatch: legacyBodyMatch.trim() || undefined,
          conditions: mode === 'builder' ? structuredConditions : [],
          actions: {
            disposition,
            sourceAccountId: showAccountMapping ? sourceAccountId : undefined,
            categoryAccountId: showAccountMapping ? categoryAccountId : undefined,
            journalDescription: journalDescription.trim() || undefined,
          },
          isActive,
          priority: priorityNumber,
        },
        workplaceId,
      );

      analytics.trackFeatureUsage('sms_rule', id ? 'update' : 'create', {
        rule_id: id,
        mode,
        disposition,
        is_active: isActive,
        priority: priorityNumber,
        condition_count: structuredConditions.length,
        has_source_mapping: !!sourceAccountId,
        has_category_mapping: !!categoryAccountId,
      });

      toast.success('Rule saved');
      AppNavigation.back();
    } catch {
      toast.error('Failed to save rule');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    categoryAccountId,
    disposition,
    id,
    isActive,
    isValid,
    journalDescription,
    legacyBodyMatch,
    legacySenderMatch,
    mode,
    priorityNumber,
    showAccountMapping,
    sourceAccountId,
    structuredConditions,
    workplaceId,
  ]);

  const handleDelete = useCallback(async () => {
    if (!id) return;
    setIsSubmitting(true);
    try {
      await smsService.deleteAutoPostRule(id, workplaceId);
      analytics.trackFeatureUsage('sms_rule', 'delete', { rule_id: id });
      toast.success('Rule deleted');
      AppNavigation.back();
    } catch {
      toast.error('Failed to delete rule');
    } finally {
      setIsSubmitting(false);
    }
  }, [id]);

  return { isSubmitting, handleSave, handleDelete };
}
