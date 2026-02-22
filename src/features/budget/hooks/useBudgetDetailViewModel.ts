import { TransactionBadge, TransactionCardProps } from '@/src/components/common/TransactionCard'
import { IconName } from '@/src/components/core'
import { AppConfig } from '@/src/constants'
import { budgetRepository } from '@/src/data/repositories/BudgetRepository'
import { useExchangeRates } from '@/src/hooks/useExchangeRates'
import { useObservable } from '@/src/hooks/useObservable'
import { budgetReadService } from '@/src/services/budget/budgetReadService'
import { exchangeRateService } from '@/src/services/exchange-rate-service'
import { EnrichedTransaction, JournalDisplayType } from '@/src/types/domain'
import { getAccountTypeVariant } from '@/src/utils/accountCategory'
import { journalPresenter } from '@/src/utils/journalPresenter'
import { logger } from '@/src/utils/logger'
import { safeAdd, safeSubtract } from '@/src/utils/money'
import { AppNavigation } from '@/src/utils/navigation'
import { preferences } from '@/src/utils/preferences'
import dayjs from 'dayjs'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { combineLatest, of, switchMap } from 'rxjs'

export interface BudgetDetailListItemViewModel {
    id: string
    type: 'transaction' | 'separator'
    date: number
    cardProps?: TransactionCardProps
    onPress?: () => void
    isCollapsed?: boolean
    onToggle?: () => void
    count?: number
    netAmount?: number
    currencyCode?: string
}

export function useBudgetDetailViewModel() {
    const params = useLocalSearchParams()
    const budgetId = params.id as string

    const [targetMonth, setTargetMonth] = useState(() => dayjs().format('YYYY-MM'))
    const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set())
    const missingCurrenciesCache = useRef(new Set<string>())
    const baseCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency

    const { rateMap: ratesMap = {} } = useExchangeRates(baseCurrency)

    const toggleDay = useCallback((timestamp: number) => {
        setCollapsedDays(prev => {
            const next = new Set(prev)
            if (next.has(timestamp)) {
                next.delete(timestamp)
            } else {
                next.add(timestamp)
            }
            return next
        })
    }, [])

    const handleJournalPress = useCallback((journalId: string) => {
        AppNavigation.toTransactionDetails(journalId)
    }, [])

    const budgetData$ = useMemo(() => {
        return budgetRepository.observeById(budgetId).pipe(
            switchMap(budget => {
                if (!budget) return of(null)
                return combineLatest([
                    of(budget),
                    budgetReadService.observeBudgetUsage(budget as any, targetMonth),
                    budgetReadService.observeBudgetEnrichedTransactions(budget as any, targetMonth)
                ])
            })
        )
    }, [budgetId, targetMonth])

    const { data: budgetData, isLoading } = useObservable(() => budgetData$, [budgetId, targetMonth], null)

    const budget = budgetData ? budgetData[0] : null
    const usage = budgetData ? budgetData[1] : null
    const transactions = budgetData ? budgetData[2] : []

    const items = useMemo(() => {
        if (!transactions.length) return []

        const result: BudgetDetailListItemViewModel[] = []
        const dayGroups: Record<number, EnrichedTransaction[]> = {}
        const days: number[] = []

        transactions.forEach((tx: EnrichedTransaction) => {
            const startOfDay = new Date(tx.transactionDate).setHours(0, 0, 0, 0)
            if (!dayGroups[startOfDay]) {
                dayGroups[startOfDay] = []
                days.push(startOfDay)
            }
            dayGroups[startOfDay].push(tx)
        })

        // Sort days descending
        days.sort((a, b) => b - a)

        days.forEach(startOfDay => {
            const txsForDay = dayGroups[startOfDay]
            const isCollapsed = collapsedDays.has(startOfDay)

            const count = txsForDay.length
            let netAmount = 0
            const precision = AppConfig.defaultCurrencyPrecision

            txsForDay.forEach(tx => {
                let amount = 0

                if (tx.currencyCode === baseCurrency) {
                    amount = tx.amount
                } else {
                    const rate = ratesMap[tx.currencyCode]
                    if (rate && rate > 0) {
                        amount = tx.amount / rate
                    } else {
                        logger.warn(`Missing exchange rate for ${tx.currencyCode} -> ${baseCurrency}`)
                    }
                }

                // In budget view, we sum everything flowing in/out of the scoped expenses.
                // A debit physically flowed matching money into an expense (spent).
                // A credit pulled money out (refund).
                if (tx.transactionType === 'DEBIT') {
                    netAmount = safeAdd(netAmount, amount, precision)
                } else if (tx.transactionType === 'CREDIT') {
                    netAmount = safeSubtract(netAmount, amount, precision)
                }
            })

            result.push({
                id: `sep-${startOfDay}`,
                type: 'separator',
                date: startOfDay,
                isCollapsed,
                onToggle: () => toggleDay(startOfDay),
                count,
                netAmount,
                currencyCode: baseCurrency,
            })

            if (isCollapsed) return

            txsForDay.forEach(tx => {
                const displayType = tx.displayType as JournalDisplayType
                const presentation = journalPresenter.getPresentation(displayType, tx.journalDescription || '')

                let typeIcon: IconName = 'document'
                let amountPrefix = ''

                // For layout purposes in the budget context, we show debit as spend (+) and credit as refund (-)
                if (tx.transactionType === 'DEBIT') {
                    typeIcon = 'arrowUp' // representing spend from budget perspective
                    amountPrefix = '+ '
                } else if (tx.transactionType === 'CREDIT') {
                    typeIcon = 'arrowDown' // representing refund to budget
                    amountPrefix = '− '
                }

                // We reconstruct badges based on the single tx account. 
                // Unlike JournalListView which shows multiple accounts, here we are 
                // typically viewing the leaf expense account that got hit.
                const badges: TransactionBadge[] = [{
                    text: tx.accountName || AppConfig.strings.journal.transaction,
                    variant: getAccountTypeVariant(tx.accountType as any),
                    icon: (tx.icon as IconName) || 'tag',
                }]

                result.push({
                    id: tx.id,
                    type: 'transaction',
                    date: tx.transactionDate,
                    onPress: () => handleJournalPress(tx.journalId),
                    cardProps: {
                        title: tx.displayTitle || tx.journalDescription || AppConfig.strings.journal.transaction,
                        amount: tx.amount,
                        currencyCode: tx.currencyCode,
                        transactionDate: tx.transactionDate,
                        presentation: {
                            label: presentation.label,
                            typeColor: tx.transactionType === 'DEBIT' ? 'warning' : 'success',
                            typeIcon,
                            amountPrefix,
                        },
                        badges,
                        notes: tx.notes,
                    }
                })
            })
        })

        return result
    }, [transactions, handleJournalPress, collapsedDays, toggleDay, ratesMap, baseCurrency])

    useEffect(() => {
        const toFetch = new Set<string>()
        transactions.forEach((tx: EnrichedTransaction) => {
            if (tx.currencyCode !== baseCurrency) {
                const rate = ratesMap[tx.currencyCode]
                if (!rate || rate <= 0) {
                    if (!missingCurrenciesCache.current.has(tx.currencyCode)) {
                        toFetch.add(tx.currencyCode)
                        missingCurrenciesCache.current.add(tx.currencyCode)
                    }
                }
            }
        })

        toFetch.forEach(currencyCode => {
            exchangeRateService.getRate(baseCurrency, currencyCode)
                .catch(e => logger.error(`Failed to dynamically fetch rate for missing currency ${currencyCode}`, e))
        })
    }, [transactions, baseCurrency, ratesMap])

    const chartData = useMemo(() => {
        if (!transactions.length || !budget) return null

        const sortedTxs = [...transactions].sort((a, b) => a.transactionDate - b.transactionDate)
        const data: { x: number, y: number }[] = []
        let cumulativeSpent = 0
        const precision = AppConfig.defaultCurrencyPrecision

        const startOfMonth = dayjs(`${targetMonth}-01`).startOf('month').valueOf()
        const endOfMonth = dayjs(`${targetMonth}-01`).endOf('month').valueOf()
        const now = Date.now()

        // Start point
        data.push({ x: startOfMonth, y: 0 })

        sortedTxs.forEach((tx) => {
            let amount = 0
            if (tx.currencyCode === baseCurrency) {
                amount = tx.amount
            } else {
                const rate = ratesMap[tx.currencyCode]
                if (rate && rate > 0) {
                    amount = tx.amount / rate
                }
            }

            // Extend previously known balance to current transaction time (flat line)
            if (tx.transactionDate >= startOfMonth && tx.transactionDate <= endOfMonth) {
                data.push({ x: tx.transactionDate, y: cumulativeSpent })
            }

            if (tx.transactionType === 'DEBIT') {
                cumulativeSpent = safeAdd(cumulativeSpent, amount, precision)
            } else if (tx.transactionType === 'CREDIT') {
                cumulativeSpent = safeSubtract(cumulativeSpent, amount, precision)
            }

            if (tx.transactionDate >= startOfMonth && tx.transactionDate <= endOfMonth) {
                data.push({ x: tx.transactionDate, y: cumulativeSpent })
            }
        })

        if (now >= startOfMonth && now <= endOfMonth) {
            data.push({ x: now, y: cumulativeSpent })
        } else if (now > endOfMonth) {
            data.push({ x: endOfMonth, y: cumulativeSpent })
        }

        return {
            data,
            domainX: [startOfMonth, endOfMonth] as [number, number]
        }
    }, [transactions, targetMonth, budget, baseCurrency, ratesMap])

    const nextMonth = useCallback(() => {
        setTargetMonth(prev => dayjs(`${prev}-01`).add(1, 'month').format('YYYY-MM'))
    }, [])

    const prevMonth = useCallback(() => {
        setTargetMonth(prev => dayjs(`${prev}-01`).subtract(1, 'month').format('YYYY-MM'))
    }, [])

    const isCurrentMonth = targetMonth === dayjs().format('YYYY-MM')

    return {
        budget,
        usage,
        items,
        isLoading,
        targetMonth,
        nextMonth,
        prevMonth,
        isCurrentMonth,
        chartData
    }
}
