import { AppConfig, Palette } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { useSummary } from '@/src/hooks/useSummary';
import { getAccountSections } from '@/src/utils/accountUtils';
import { getContrastColor } from '@/src/utils/colorUtils';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

export interface AccountCardViewModel {
    id: string;
    name: string;
    icon: string | null;
    accentColor: string;
    textColor: string;
    balanceText: string;
    monthlyIncomeText: string;
    monthlyExpenseText: string;
    showMonthlyStats: boolean;
    currencyCode: string;
}

export interface AccountSectionViewModel {
    title: string;
    count: number;
    totalDisplay: string;
    totalColor: string;
    isCollapsed: boolean;
    data: AccountCardViewModel[];
}

export interface AccountsListViewModel {
    theme: ReturnType<typeof useTheme>['theme'];
    sections: AccountSectionViewModel[];
    isRefreshing: boolean;
    onRefresh: () => void;
    onToggleSection: (title: string) => void;
    onAccountPress: (accountId: string) => void;
    onCreateAccount: () => void;
    onReorderPress: () => void;
    onTogglePrivacy: () => void;
    isPrivacyMode: boolean;
}

export function useAccountsListViewModel(): AccountsListViewModel {
    const router = useRouter();
    const { theme } = useTheme();
    const { defaultCurrency, showAccountMonthlyStats } = useUI();
    const {
        accounts,
        balancesByAccountId,
        totalAssets,
        totalLiabilities,
        totalEquity,
        totalIncome,
        totalExpense,
        isPrivacyMode,
        togglePrivacyMode,
        isLoading,
        version
    } = useSummary();

    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['Equity']));

    const onToggleSection = useCallback((title: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(title)) next.delete(title);
            else next.add(title);
            return next;
        });
    }, []);

    const onAccountPress = useCallback((accountId: string) => {
        router.push(`/account-details?accountId=${accountId}` as any);
    }, [router]);

    const onCreateAccount = useCallback(() => {
        router.push('/account-creation' as any);
    }, [router]);

    const onReorderPress = useCallback(() => {
        router.push('/account-reorder' as any);
    }, [router]);

    const onTogglePrivacy = useCallback(() => {
        togglePrivacyMode();
    }, [togglePrivacyMode]);

    const onRefresh = useCallback(() => { }, []);

    const sections = useMemo(() => {
        if (!accounts.length) return [] as AccountSectionViewModel[];
        const rawSections = getAccountSections(accounts);

        return rawSections.map((section) => {
            let sectionColor = theme.text;
            let sectionTotal = 0;

            if (section.title === 'Assets') {
                sectionColor = theme.asset;
                sectionTotal = totalAssets;
            } else if (section.title === 'Liabilities') {
                sectionColor = theme.liability;
                sectionTotal = totalLiabilities;
            } else if (section.title === 'Equity') {
                sectionColor = theme.equity;
                sectionTotal = totalEquity;
            } else if (section.title === 'Income') {
                sectionColor = theme.income;
                sectionTotal = totalIncome;
            } else if (section.title === 'Expenses') {
                sectionColor = theme.expense;
                sectionTotal = totalExpense;
            }

            const totalDisplay = isPrivacyMode
                ? '••••'
                : CurrencyFormatter.formatShort(sectionTotal, defaultCurrency || AppConfig.defaultCurrency);

            const data = section.data.map((account: Account) => {
                let accentColor = theme.asset;
                const typeLower = account.accountType.toLowerCase();

                if (typeLower === 'liability') accentColor = theme.liability;
                else if (typeLower === 'equity') accentColor = theme.equity;
                else if (typeLower === 'income') accentColor = theme.income;
                else if (typeLower === 'expense') accentColor = theme.expense;

                const contrastColor = getContrastColor(accentColor);
                const textColor = contrastColor === 'white' ? Palette.pureWhite : Palette.trueBlack;

                const balanceData = balancesByAccountId.get(account.id) || null;
                const balance = balanceData?.balance || 0;
                const monthlyIncome = balanceData?.monthlyIncome || 0;
                const monthlyExpenses = balanceData?.monthlyExpenses || 0;

                const balanceText = isLoading ? '...' : CurrencyFormatter.format(balance, account.currencyCode);
                const monthlyIncomeText = isLoading ? '...' : CurrencyFormatter.format(monthlyIncome, account.currencyCode);
                const monthlyExpenseText = isLoading ? '...' : CurrencyFormatter.format(monthlyExpenses, account.currencyCode);

                return {
                    id: account.id,
                    name: account.name,
                    icon: account.icon || null,
                    accentColor,
                    textColor,
                    balanceText,
                    monthlyIncomeText,
                    monthlyExpenseText,
                    showMonthlyStats: showAccountMonthlyStats,
                    currencyCode: account.currencyCode,
                };
            });

            return {
                title: section.title,
                count: section.data.length,
                totalDisplay,
                totalColor: sectionColor,
                isCollapsed: collapsedSections.has(section.title),
                data,
            };
        });
    }, [
        accounts,
        version,
        balancesByAccountId,
        isLoading,
        collapsedSections,
        defaultCurrency,
        isPrivacyMode,
        showAccountMonthlyStats,
        theme.asset,
        theme.equity,
        theme.expense,
        theme.income,
        theme.liability,
        theme.text,
        totalAssets,
        totalEquity,
        totalExpense,
        totalIncome,
        totalLiabilities,
    ]);

    return {
        theme,
        sections,
        isRefreshing: isLoading,
        onRefresh,
        onToggleSection,
        onAccountPress,
        onCreateAccount,
        onReorderPress,
        onTogglePrivacy,
        isPrivacyMode,
    };
}
