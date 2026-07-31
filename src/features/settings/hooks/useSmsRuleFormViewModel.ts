import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { useAccounts } from '@/src/features/accounts';
import { useSmsRulePreview } from '@/src/features/settings/hooks/useSmsRulePreview';
import { analytics } from '@/src/services/analytics-service';
import { SmsRuleDisposition, SmsRuleMode } from '@/src/services/ledger/RuleMatcher';
import {
  buildStructuredSmsRuleConditions,
  hydrateSmsRuleForm,
  isSmsRuleFormValid,
  shouldShowSmsRuleAccountMapping,
  validateSmsRuleRegexPatterns,
} from '@/src/services/sms/smsRuleFormPolicy';
import { smsRuleReadService } from '@/src/services/sms/smsRuleReadService';
import { smsService } from '@/src/services/sms-service';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface SmsRuleFormViewModel {
  id?: string;
  mode: SmsRuleMode;
  setMode: (val: SmsRuleMode) => void;
  legacySenderMatch: string;
  setLegacySenderMatch: (val: string) => void;
  legacyBodyMatch: string;
  setLegacyBodyMatch: (val: string) => void;
  senderContains: string;
  setSenderContains: (val: string) => void;
  bodyContains: string;
  setBodyContains: (val: string) => void;
  merchantContains: string;
  setMerchantContains: (val: string) => void;
  accountSourceContains: string;
  setAccountSourceContains: (val: string) => void;
  direction: '' | 'debit' | 'credit';
  setDirection: (val: '' | 'debit' | 'credit') => void;
  currencyCode: string;
  setCurrencyCode: (val: string) => void;
  amountOperator: '' | 'eq' | 'gt' | 'lt' | 'between';
  setAmountOperator: (val: '' | 'eq' | 'gt' | 'lt' | 'between') => void;
  amountValue: string;
  setAmountValue: (val: string) => void;
  amountSecondaryValue: string;
  setAmountSecondaryValue: (val: string) => void;
  disposition: SmsRuleDisposition;
  setDisposition: (val: SmsRuleDisposition) => void;
  priority: string;
  setPriority: (val: string) => void;
  sourceAccountId: AccountId;
  setSourceAccountId: (val: AccountId) => void;
  categoryAccountId: AccountId;
  setCategoryAccountId: (val: AccountId) => void;
  journalDescription: string;
  setJournalDescription: (val: string) => void;
  isActive: boolean;
  setIsActive: (val: boolean) => void;
  pickingAccountFor: 'source' | 'category' | null;
  setPickingAccountFor: (val: 'source' | 'category' | null) => void;
  isSubmitting: boolean;
  isValid: boolean;
  handleSave: () => Promise<void>;
  handleDelete: () => Promise<void>;
  accounts: Account[];
  previewMatches: TransactionInboxRecord[];
  showAccountMapping: boolean;
}

type SeedInput = {
  senderMatch?: string;
  bodyMatch?: string;
  sourceAccountId?: AccountId;
  categoryAccountId?: AccountId;
};

export function useSmsRuleFormViewModel(id?: string, seed?: SeedInput): SmsRuleFormViewModel {
  const { workplaceId } = useWorkplace();
  const { accounts } = useAccounts(workplaceId);

  const [mode, setMode] = useState<SmsRuleMode>('builder');
  const [legacySenderMatch, setLegacySenderMatch] = useState(seed?.senderMatch || '');
  const [legacyBodyMatch, setLegacyBodyMatch] = useState(seed?.bodyMatch || '');
  const [senderContains, setSenderContains] = useState(seed?.senderMatch || '');
  const [bodyContains, setBodyContains] = useState(seed?.bodyMatch || '');
  const [merchantContains, setMerchantContains] = useState('');
  const [accountSourceContains, setAccountSourceContains] = useState('');
  const [direction, setDirection] = useState<'' | 'debit' | 'credit'>('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [amountOperator, setAmountOperator] = useState<'' | 'eq' | 'gt' | 'lt' | 'between'>('');
  const [amountValue, setAmountValue] = useState('');
  const [amountSecondaryValue, setAmountSecondaryValue] = useState('');
  const [disposition, setDisposition] = useState<SmsRuleDisposition>('auto_post');
  const [priority, setPriority] = useState('100');
  const [sourceAccountId, setSourceAccountId] = useState(seed?.sourceAccountId || EMPTY_ACCOUNT_ID);
  const [categoryAccountId, setCategoryAccountId] = useState(
    seed?.categoryAccountId || EMPTY_ACCOUNT_ID,
  );
  const [journalDescription, setJournalDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [pickingAccountFor, setPickingAccountFor] = useState<'source' | 'category' | null>(null);
  useEffect(() => {
    if (!id) return;

    const loadRule = async () => {
      try {
        const rule = await smsRuleReadService.find(workplaceId, id);
        if (!rule) return;
        const hydrated = hydrateSmsRuleForm(rule);
        setMode(hydrated.mode);
        setLegacySenderMatch(hydrated.legacySenderMatch);
        setLegacyBodyMatch(hydrated.legacyBodyMatch);
        setDisposition(hydrated.disposition);
        setSourceAccountId(hydrated.sourceAccountId || EMPTY_ACCOUNT_ID);
        setCategoryAccountId(hydrated.categoryAccountId || EMPTY_ACCOUNT_ID);
        setJournalDescription(hydrated.journalDescription);
        setPriority(hydrated.priority);
        setIsActive(hydrated.isActive);

        if (hydrated.mode === 'builder') {
          setSenderContains(hydrated.builderFields.senderContains);
          setBodyContains(hydrated.builderFields.bodyContains);
          setMerchantContains(hydrated.builderFields.merchantContains);
          setAccountSourceContains(hydrated.builderFields.accountSourceContains);
          setDirection(hydrated.builderFields.direction);
          setCurrencyCode(hydrated.builderFields.currencyCode);
          setAmountOperator(hydrated.builderFields.amountOperator);
          setAmountValue(hydrated.builderFields.amountValue);
          setAmountSecondaryValue(hydrated.builderFields.amountSecondaryValue);
        }
      } catch {
        toast.error('Failed to load rule');
        AppNavigation.back();
      }
    };

    loadRule();
  }, [id, workplaceId]);

  const structuredConditions = useMemo(
    () =>
      buildStructuredSmsRuleConditions({
        senderContains,
        bodyContains,
        merchantContains,
        accountSourceContains,
        direction,
        currencyCode,
        amountOperator,
        amountValue,
        amountSecondaryValue,
      }),
    [
      accountSourceContains,
      amountOperator,
      amountSecondaryValue,
      amountValue,
      bodyContains,
      currencyCode,
      direction,
      merchantContains,
      senderContains,
    ],
  );

  const previewMatches = useSmsRulePreview(
    mode,
    structuredConditions,
    legacySenderMatch,
    legacyBodyMatch,
  );

  const showAccountMapping = shouldShowSmsRuleAccountMapping(disposition);
  const priorityNumber = priority.trim() ? Number(priority.trim()) : 100;

  const isValid = isSmsRuleFormValid({
    mode,
    legacySenderMatch,
    legacyBodyMatch,
    structuredConditions,
    amountOperator,
    amountValue,
    amountSecondaryValue,
    priority,
    disposition,
    sourceAccountId,
    categoryAccountId,
    emptyAccountId: EMPTY_ACCOUNT_ID,
  });

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
  }, [id, workplaceId]);

  return {
    id,
    mode,
    setMode,
    legacySenderMatch,
    setLegacySenderMatch,
    legacyBodyMatch,
    setLegacyBodyMatch,
    senderContains,
    setSenderContains,
    bodyContains,
    setBodyContains,
    merchantContains,
    setMerchantContains,
    accountSourceContains,
    setAccountSourceContains,
    direction,
    setDirection,
    currencyCode,
    setCurrencyCode,
    amountOperator,
    setAmountOperator,
    amountValue,
    setAmountValue,
    amountSecondaryValue,
    setAmountSecondaryValue,
    disposition,
    setDisposition,
    priority,
    setPriority,
    sourceAccountId,
    setSourceAccountId,
    categoryAccountId,
    setCategoryAccountId,
    journalDescription,
    setJournalDescription,
    isActive,
    setIsActive,
    pickingAccountFor,
    setPickingAccountFor,
    isSubmitting,
    isValid,
    handleSave,
    handleDelete,
    accounts,
    previewMatches,
    showAccountMapping,
  };
}
