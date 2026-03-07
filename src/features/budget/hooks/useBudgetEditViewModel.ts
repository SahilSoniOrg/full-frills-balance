import { AppConfig } from '@/src/constants/app-config'
import { useUI } from '@/src/contexts/UIContext'
import { AccountType } from '@/src/data/models/Account'
import Budget from '@/src/data/models/Budget'
import { accountRepository } from '@/src/data/repositories/AccountRepository'
import { budgetRepository } from '@/src/data/repositories/BudgetRepository'
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository'
import { useObservable } from '@/src/hooks/useObservable'
import { budgetWriteService } from '@/src/services/budget/budgetWriteService'
import { logger } from '@/src/utils/logger'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'

export function useBudgetEditViewModel() {
    const params = useLocalSearchParams()
    const budgetId = params.id as string
    const { defaultCurrency } = useUI()
    const { data: expenseAccounts = [] } = useObservable(() => accountRepository.observeByType(AccountType.EXPENSE), [], [])
    const { data: currencies = [] } = useObservable(() => currencyRepository.observeAll(), [], [])

    const [budget, setBudget] = useState<Budget | null>(null)
    const [name, setName] = useState('')
    const [amount, setAmount] = useState('')
    const [currencyCode, setCurrencyCode] = useState<string>(defaultCurrency || AppConfig.defaultCurrency)
    const [startMonth, setStartMonth] = useState(new Date())
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
    const [loading, setLoading] = useState(!!budgetId)
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
        if (budgetId) {
            budgetRepository.find(budgetId).then(async b => {
                if (!b) return
                setBudget(b)
                setName(b.name)
                setAmount(b.amount.toString())
                setCurrencyCode(b.currencyCode || defaultCurrency || AppConfig.defaultCurrency)
                const [year, month] = b.startMonth.split('-')
                setStartMonth(new Date(parseInt(year), parseInt(month) - 1, 1))

                const scopes = await budgetRepository.getScopes(budgetId)
                setSelectedAccountIds(scopes.map(s => s.account.id))
                setLoading(false)
            }).catch(e => {
                logger.error('Failed to load budget', e)
                setLoading(false)
            })
        }
    }, [budgetId, defaultCurrency])

    const save = useCallback(async () => {
        if (!name.trim() || !amount || selectedAccountIds.length === 0) {
            throw new Error('Please fill all required fields and select at least one account.')
        }

        setIsSaving(true)
        try {
            const parsedAmount = parseFloat(amount)
            const monthStr = `${startMonth.getFullYear()}-${String(startMonth.getMonth() + 1).padStart(2, '0')}`

            const input = {
                name: name.trim(),
                amount: parsedAmount,
                currencyCode,
                startMonth: monthStr,
                active: true
            }

            if (budget) {
                await budgetWriteService.updateBudget(budget, input, selectedAccountIds)
            } else {
                await budgetWriteService.createBudget(input, selectedAccountIds)
            }
            router.back()
        } finally {
            setIsSaving(false)
        }
    }, [budget, name, amount, startMonth, selectedAccountIds, currencyCode])

    const deleteBudget = useCallback(async () => {
        if (budget) {
            setIsSaving(true)
            try {
                await budgetWriteService.deleteBudget(budget)
                router.back()
            } finally {
                setIsSaving(false)
            }
        }
    }, [budget])

    return {
        expenseAccounts,
        budget,
        name,
        setName,
        amount,
        setAmount,
        startMonth,
        setStartMonth,
        selectedAccountIds,
        setSelectedAccountIds,
        currencies,
        currencyCode,
        setCurrencyCode,
        save,
        deleteBudget,
        loading,
        isSaving,
        isFormValid: name.trim() && amount && selectedAccountIds.length > 0
    }
}
