import { TransactionBadge } from '@/src/components/common/TransactionCard';
import { IconName } from '@/src/components/core';
import { AppConfig } from '@/src/constants';
import { journalService } from '@/src/features/journal';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useObservable } from '@/src/hooks/useObservable';
import { useTransactionGrouping } from '@/src/hooks/useTransactionGrouping';
import { EnrichedJournal, JournalDisplayType } from '@/src/types/domain';
import { getAccountTypeVariant } from '@/src/utils/accountCategory';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { AppNavigation } from '@/src/utils/navigation';
import { preferences } from '@/src/utils/preferences';
import { useMemo } from 'react';
import { of } from 'rxjs';

interface UseInsightDetailsViewModelParams {
    journalIds: string[];
    baseCurrency?: string;
}

export function useInsightDetailsViewModel({
    journalIds,
    baseCurrency = preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
}: UseInsightDetailsViewModelParams) {
    const journals$ = useMemo(() => {
        if (journalIds.length === 0) return of([]);

        return journalService.observeEnrichedJournals(AppConfig.defaults.insightDetailsFetchLimit, {
            startDate: 0,
            endDate: Date.now() + AppConfig.time.msPerDay,
            journalIds: journalIds
        });
    }, [journalIds]);

    // Re-filtering journals locally to match the IDs
    const { data: allJournals, isLoading } = useObservable(() => journals$, [journals$], []);

    // We need a way to filter journals who HAVE the transactions in our list.
    // This is a bit inefficient if we have many journals, but for insights it's usually small.
    // Better: Modify journalService or create a focused one.
    // For now, let's just use the IDs we have.

    const enrichedJournals = useMemo(() => {
        // This is a placeholder for real filtering if needed, 
        // but observeEnrichedJournals already returns specific journals if we use accountId etc.
        // For now, let's assume we want to show transactions.
        return allJournals;
    }, [allJournals]);

    useCurrencyPrecision(baseCurrency);

    const transactionGroupingOptions = useMemo(() => ({
        items: enrichedJournals,
        getDate: (j: EnrichedJournal) => j.journalDate,
        sortByDate: 'desc' as const,
        getStats: (journalsForDay: EnrichedJournal[]) => {
            return {
                count: journalsForDay.length,
                netAmount: 0, // Not needed for insight details
                currencyCode: baseCurrency,
            };
        },
        renderItem: (journal: EnrichedJournal) => {
            const displayType = journal.displayType as JournalDisplayType;
            const presentation = journalPresenter.getPresentation(displayType, journal.semanticLabel);

            let typeIcon: IconName = 'document';
            let amountPrefix = '';
            if (displayType === JournalDisplayType.INCOME) {
                typeIcon = 'arrowUp';
                amountPrefix = '+ ';
            } else if (displayType === JournalDisplayType.EXPENSE) {
                typeIcon = 'arrowDown';
                amountPrefix = '− ';
            } else if (displayType === JournalDisplayType.TRANSFER) {
                typeIcon = 'swapHorizontal';
            }

            const badges: TransactionBadge[] = journal.accounts.slice(0, 2).map(acc => {
                const isSource = acc.role === 'SOURCE';
                const isDest = acc.role === 'DESTINATION';
                const showPrefix = isSource ? AppConfig.strings.journal.from : (isDest ? AppConfig.strings.journal.to : '');

                return {
                    text: `${showPrefix}${acc.name}`,
                    variant: getAccountTypeVariant(acc.accountType),
                    icon: (acc.icon as IconName) || (acc.accountType === 'EXPENSE' ? 'tag' : 'wallet'),
                };
            });

            const defaultTitle = displayType === JournalDisplayType.TRANSFER
                ? AppConfig.strings.journal.transfer
                : AppConfig.strings.journal.transaction;

            return {
                id: journal.id,
                type: 'transaction' as const,
                date: journal.journalDate,
                onPress: () => AppNavigation.toTransactionDetails(journal.id),
                cardProps: {
                    title: journal.description || defaultTitle,
                    amount: journal.totalAmount,
                    currencyCode: journal.currencyCode,
                    transactionDate: journal.journalDate,
                    presentation: {
                        label: presentation.label,
                        typeColor: presentation.colorKey,
                        typeIcon,
                        amountPrefix,
                    },
                    badges,
                }
            };
        }
    }), [enrichedJournals, baseCurrency]);

    const { groupedItems: items } = useTransactionGrouping(transactionGroupingOptions);

    return {
        items,
        isLoading,
    };
}
