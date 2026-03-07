import { database } from '@/src/data/database/Database'
import Account from '@/src/data/models/Account'
import SmsAutoPostRule from '@/src/data/models/SmsAutoPostRule'
import SmsInboxRecord from '@/src/data/models/SmsInboxRecord'
import { useAccounts } from '@/src/features/accounts'
import {
  SmsRuleActions,
  SmsRuleCondition,
  SmsRuleDisposition,
  SmsRuleMode,
  SmsRulePreviewInput,
  smsService,
} from '@/src/services/sms-service'
import { toast } from '@/src/utils/alerts'
import { AppNavigation } from '@/src/utils/navigation'
import { useEffect, useMemo, useState } from 'react'

export interface SmsRuleFormViewModel {
  id?: string
  mode: SmsRuleMode
  setMode: (val: SmsRuleMode) => void
  legacySenderMatch: string
  setLegacySenderMatch: (val: string) => void
  legacyBodyMatch: string
  setLegacyBodyMatch: (val: string) => void
  senderContains: string
  setSenderContains: (val: string) => void
  bodyContains: string
  setBodyContains: (val: string) => void
  merchantContains: string
  setMerchantContains: (val: string) => void
  accountSourceContains: string
  setAccountSourceContains: (val: string) => void
  direction: '' | 'debit' | 'credit'
  setDirection: (val: '' | 'debit' | 'credit') => void
  currencyCode: string
  setCurrencyCode: (val: string) => void
  amountOperator: '' | 'eq' | 'gt' | 'lt' | 'between'
  setAmountOperator: (val: '' | 'eq' | 'gt' | 'lt' | 'between') => void
  amountValue: string
  setAmountValue: (val: string) => void
  amountSecondaryValue: string
  setAmountSecondaryValue: (val: string) => void
  disposition: SmsRuleDisposition
  setDisposition: (val: SmsRuleDisposition) => void
  priority: string
  setPriority: (val: string) => void
  sourceAccountId: string
  setSourceAccountId: (val: string) => void
  categoryAccountId: string
  setCategoryAccountId: (val: string) => void
  isActive: boolean
  setIsActive: (val: boolean) => void
  pickingAccountFor: 'source' | 'category' | null
  setPickingAccountFor: (val: 'source' | 'category' | null) => void
  isSubmitting: boolean
  isValid: boolean
  handleSave: () => Promise<void>
  handleDelete: () => Promise<void>
  accounts: Account[]
  previewMatches: SmsInboxRecord[]
  showAccountMapping: boolean
}

type SeedInput = {
  senderMatch?: string
  bodyMatch?: string
  sourceAccountId?: string
  categoryAccountId?: string
}

function parseConditions(rule: SmsAutoPostRule): SmsRuleCondition[] {
  if (!rule.conditionsJson) return []
  try {
    const parsed = JSON.parse(rule.conditionsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseActions(rule: SmsAutoPostRule): SmsRuleActions {
  if (rule.actionsJson) {
    try {
      const parsed = JSON.parse(rule.actionsJson)
      if (parsed && typeof parsed === 'object') {
        return {
          disposition: parsed.disposition === 'ignore' || parsed.disposition === 'review' ? parsed.disposition : 'auto_post',
          sourceAccountId: parsed.sourceAccountId || rule.sourceAccountId || undefined,
          categoryAccountId: parsed.categoryAccountId || rule.categoryAccountId || undefined,
        }
      }
    } catch {
      // fallback below
    }
  }

  return {
    disposition: 'auto_post',
    sourceAccountId: rule.sourceAccountId || undefined,
    categoryAccountId: rule.categoryAccountId || undefined,
  }
}

function getConditionValue(conditions: SmsRuleCondition[], field: SmsRuleCondition['field']): SmsRuleCondition | undefined {
  return conditions.find((condition) => condition.field === field)
}

export function useSmsRuleFormViewModel(id?: string, seed?: SeedInput): SmsRuleFormViewModel {
  const { accounts } = useAccounts()

  const [mode, setMode] = useState<SmsRuleMode>('builder')
  const [legacySenderMatch, setLegacySenderMatch] = useState(seed?.senderMatch || '')
  const [legacyBodyMatch, setLegacyBodyMatch] = useState(seed?.bodyMatch || '')
  const [senderContains, setSenderContains] = useState(seed?.senderMatch || '')
  const [bodyContains, setBodyContains] = useState(seed?.bodyMatch || '')
  const [merchantContains, setMerchantContains] = useState('')
  const [accountSourceContains, setAccountSourceContains] = useState('')
  const [direction, setDirection] = useState<'' | 'debit' | 'credit'>('')
  const [currencyCode, setCurrencyCode] = useState('')
  const [amountOperator, setAmountOperator] = useState<'' | 'eq' | 'gt' | 'lt' | 'between'>('')
  const [amountValue, setAmountValue] = useState('')
  const [amountSecondaryValue, setAmountSecondaryValue] = useState('')
  const [disposition, setDisposition] = useState<SmsRuleDisposition>('auto_post')
  const [priority, setPriority] = useState('100')
  const [sourceAccountId, setSourceAccountId] = useState(seed?.sourceAccountId || '')
  const [categoryAccountId, setCategoryAccountId] = useState(seed?.categoryAccountId || '')
  const [isActive, setIsActive] = useState(true)
  const [pickingAccountFor, setPickingAccountFor] = useState<'source' | 'category' | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewMatches, setPreviewMatches] = useState<SmsInboxRecord[]>([])

  useEffect(() => {
    if (!id) return

    const loadRule = async () => {
      try {
        const rule = await database.collections.get<SmsAutoPostRule>('sms_auto_post_rules').find(id)
        const conditions = parseConditions(rule)
        const actions = parseActions(rule)
        const structured = conditions.length > 0

        setMode(structured ? 'builder' : 'regex')
        setLegacySenderMatch(rule.senderMatch || '')
        setLegacyBodyMatch(rule.bodyMatch || '')
        setDisposition(actions.disposition)
        setSourceAccountId(actions.sourceAccountId || '')
        setCategoryAccountId(actions.categoryAccountId || '')
        setPriority(String(rule.priority ?? 100))
        setIsActive(rule.isActive)

        if (structured) {
          setSenderContains(getConditionValue(conditions, 'sender')?.value || '')
          setBodyContains(getConditionValue(conditions, 'body')?.value || '')
          setMerchantContains(getConditionValue(conditions, 'merchant')?.value || '')
          setAccountSourceContains(getConditionValue(conditions, 'account_source')?.value || '')
          setDirection((getConditionValue(conditions, 'direction')?.value as '' | 'debit' | 'credit' | undefined) || '')
          setCurrencyCode(getConditionValue(conditions, 'currency')?.value || '')
          const amountCondition = getConditionValue(conditions, 'amount')
          setAmountOperator((amountCondition?.operator as '' | 'eq' | 'gt' | 'lt' | 'between' | undefined) || '')
          setAmountValue(amountCondition?.minValue !== undefined ? String(amountCondition.minValue) : '')
          setAmountSecondaryValue(amountCondition?.maxValue !== undefined ? String(amountCondition.maxValue) : '')
        }
      } catch {
        toast.error('Failed to load rule')
        AppNavigation.back()
      }
    }

    loadRule()
  }, [id])

  const structuredConditions = useMemo<SmsRuleCondition[]>(() => {
    const amountNumber = amountValue.trim() ? Number(amountValue.trim()) : undefined
    const amountSecondNumber = amountSecondaryValue.trim() ? Number(amountSecondaryValue.trim()) : undefined

    const conditions: SmsRuleCondition[] = []
    if (senderContains.trim()) {
      conditions.push({ field: 'sender', operator: 'contains', value: senderContains.trim() })
    }
    if (bodyContains.trim()) {
      conditions.push({ field: 'body', operator: 'contains', value: bodyContains.trim() })
    }
    if (merchantContains.trim()) {
      conditions.push({ field: 'merchant', operator: 'contains', value: merchantContains.trim() })
    }
    if (accountSourceContains.trim()) {
      conditions.push({ field: 'account_source', operator: 'contains', value: accountSourceContains.trim() })
    }
    if (direction) {
      conditions.push({ field: 'direction', operator: 'is', value: direction })
    }
    if (currencyCode.trim()) {
      conditions.push({ field: 'currency', operator: 'is', value: currencyCode.trim().toUpperCase() })
    }
    if (amountOperator && amountNumber !== undefined && !Number.isNaN(amountNumber)) {
      conditions.push({
        field: 'amount',
        operator: amountOperator,
        minValue: amountNumber,
        maxValue: amountOperator === 'between' && amountSecondNumber !== undefined && !Number.isNaN(amountSecondNumber)
          ? amountSecondNumber
          : undefined,
      })
    }

    return conditions
  }, [accountSourceContains, amountOperator, amountSecondaryValue, amountValue, bodyContains, currencyCode, direction, merchantContains, senderContains])

  useEffect(() => {
    let active = true

    const loadPreview = async () => {
      const input: SmsRulePreviewInput = mode === 'builder'
        ? { mode, conditions: structuredConditions }
        : { mode, senderMatch: legacySenderMatch.trim(), bodyMatch: legacyBodyMatch.trim() || undefined }

      const hasConditions = mode === 'builder'
        ? structuredConditions.length > 0
        : legacySenderMatch.trim().length > 0

      if (!hasConditions) {
        setPreviewMatches([])
        return
      }

      try {
        const matches = await smsService.previewRuleMatches(input)
        if (active) {
          setPreviewMatches(matches)
        }
      } catch {
        if (active) {
          setPreviewMatches([])
        }
      }
    }

    loadPreview()
    return () => {
      active = false
    }
  }, [legacyBodyMatch, legacySenderMatch, mode, structuredConditions])

  const showAccountMapping = disposition === 'auto_post'
  const hasBuilderConditions = structuredConditions.length > 0
  const hasRegexConditions = legacySenderMatch.trim().length > 0
  const priorityNumber = priority.trim() ? Number(priority.trim()) : 100
  const priorityIsValid = Number.isFinite(priorityNumber) && priorityNumber >= 0
  const amountIsValid = amountOperator
    ? (amountValue.trim().length > 0 && (amountOperator !== 'between' || amountSecondaryValue.trim().length > 0))
    : true
  const isValid = (mode === 'builder' ? hasBuilderConditions : hasRegexConditions)
    && amountIsValid
    && priorityIsValid
    && (!showAccountMapping || (!!sourceAccountId && !!categoryAccountId))

  const handleSave = async () => {
    if (!isValid) return

    if (mode === 'regex') {
      try {
        new RegExp(legacySenderMatch.trim(), 'i')
        if (legacyBodyMatch.trim()) new RegExp(legacyBodyMatch.trim(), 'i')
      } catch {
        toast.error('Invalid regex syntax in advanced match fields')
        return
      }
    }

    setIsSubmitting(true)
    try {
      await smsService.saveAutoPostRule({
        id,
        mode,
        senderMatch: legacySenderMatch.trim() || undefined,
        bodyMatch: legacyBodyMatch.trim() || undefined,
        conditions: mode === 'builder' ? structuredConditions : [],
        actions: {
          disposition,
          sourceAccountId: showAccountMapping ? sourceAccountId : undefined,
          categoryAccountId: showAccountMapping ? categoryAccountId : undefined,
        },
        isActive,
        priority: priorityNumber,
      })
      toast.success('Rule saved')
      AppNavigation.back()
    } catch {
      toast.error('Failed to save rule')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    setIsSubmitting(true)
    try {
      await smsService.deleteAutoPostRule(id)
      toast.success('Rule deleted')
      AppNavigation.back()
    } catch {
      toast.error('Failed to delete rule')
    } finally {
      setIsSubmitting(false)
    }
  }

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
  }
}
