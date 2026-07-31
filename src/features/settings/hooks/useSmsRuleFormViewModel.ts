import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { useAccounts } from '@/src/features/accounts';
import { useSmsRulePreview } from '@/src/features/settings/hooks/useSmsRulePreview';
import { useSmsRuleFormActions } from '@/src/features/settings/hooks/useSmsRuleFormActions';
import { SmsRuleDisposition, SmsRuleMode } from '@/src/services/ledger/RuleMatcher';
import {
  buildStructuredSmsRuleConditions,
  getSmsRuleConditionValue,
  isSmsRuleFormValid,
  parseSmsRuleActions,
  parseSmsRuleConditions,
  shouldShowSmsRuleAccountMapping,
} from '@/src/services/sms/smsRuleFormPolicy';
import { smsRuleReadService } from '@/src/services/sms/smsRuleReadService';
import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { toast } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useEffect, useMemo, useState } from 'react';

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
        const rule = await smsRuleReadService.find(id);
        if (!rule) return;
        const conditions = parseSmsRuleConditions(rule);
        const actions = parseSmsRuleActions(rule);
        const structured = conditions.length > 0;

        setMode(structured ? 'builder' : 'regex');
        setLegacySenderMatch(rule.senderMatch || '');
        setLegacyBodyMatch(rule.bodyMatch || '');
        setDisposition(actions.disposition);
        setSourceAccountId(actions.sourceAccountId || EMPTY_ACCOUNT_ID);
        setCategoryAccountId(actions.categoryAccountId || EMPTY_ACCOUNT_ID);
        setJournalDescription(actions.journalDescription || '');
        setPriority(String(rule.priority ?? 100));
        setIsActive(rule.isActive);

        if (structured) {
          setSenderContains(getSmsRuleConditionValue(conditions, 'sender')?.value || '');
          setBodyContains(getSmsRuleConditionValue(conditions, 'body')?.value || '');
          setMerchantContains(getSmsRuleConditionValue(conditions, 'merchant')?.value || '');
          setAccountSourceContains(
            getSmsRuleConditionValue(conditions, 'account_source')?.value || '',
          );
          setDirection(
            (getSmsRuleConditionValue(conditions, 'direction')?.value as
              '' | 'debit' | 'credit' | undefined) || '',
          );
          setCurrencyCode(getSmsRuleConditionValue(conditions, 'currency')?.value || '');
          const amountCondition = getSmsRuleConditionValue(conditions, 'amount');
          setAmountOperator(
            (amountCondition?.operator as '' | 'eq' | 'gt' | 'lt' | 'between' | undefined) || '',
          );
          setAmountValue(
            amountCondition?.minValue !== undefined ? String(amountCondition.minValue) : '',
          );
          setAmountSecondaryValue(
            amountCondition?.maxValue !== undefined ? String(amountCondition.maxValue) : '',
          );
        }
      } catch {
        toast.error('Failed to load rule');
        AppNavigation.back();
      }
    };

    loadRule();
  }, [id]);

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

  const { isSubmitting, handleSave, handleDelete } = useSmsRuleFormActions({
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
  });

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
