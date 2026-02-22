import { AccountType } from '@/src/data/models/Account';
import { CreateJournalData } from '@/src/data/repositories/JournalRepository';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { accountingService } from '@/src/utils/accountingService';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { roundToPrecision } from '@/src/utils/money';

export interface PreparedJournalData {
    transactions: CreateJournalData['transactions'];
    totalAmount: number;
    displayType: string;
    calculatedBalances: Map<string, number>;
    accountsToRebuild: Set<string>;
}

export async function prepareJournalData(data: CreateJournalData): Promise<PreparedJournalData> {
    const accountIds = [...new Set(data.transactions.map((t) => t.accountId))];
    const accounts = await accountRepository.findAllByIds(accountIds);
    const accountTypes = new Map(accounts.map((a) => [a.id, a.accountType as AccountType]));

    const accountPrecisions = new Map<string, number>();
    await Promise.all(
        accounts.map(async (acc) => {
            const precision = await currencyRepository.getPrecision(acc.currencyCode);
            accountPrecisions.set(acc.id, precision);
        }),
    );
    const journalPrecision = await currencyRepository.getPrecision(data.currencyCode);

    const roundedTransactions = data.transactions.map((t) => ({
        ...t,
        amount: roundToPrecision(t.amount, accountPrecisions.get(t.accountId) ?? 2),
    }));

    const validation = accountingService.validateJournal(
        roundedTransactions.map((t) => ({
            amount: t.amount,
            type: t.transactionType,
            exchangeRate: t.exchangeRate,
            accountCurrency: t.currencyCode,
        })),
        journalPrecision,
    );

    if (!validation.isValid) {
        throw new Error(`Unbalanced journal: ${validation.imbalance}`);
    }

    const accountsToRebuild = new Set<string>(accountIds);
    const calculatedBalances = new Map<string, number>();

    for (const tx of roundedTransactions) {
        const latestTx = await transactionRepository.findLatestForAccountBeforeDate(tx.accountId, data.journalDate);
        if (!accountingService.isBackdated(data.journalDate, latestTx?.transactionDate)) {
            const balance = accountingService.calculateNewBalance(
                latestTx?.runningBalance || 0,
                tx.amount,
                accountTypes.get(tx.accountId)!,
                tx.transactionType,
                accountPrecisions.get(tx.accountId) ?? 2,
            );
            calculatedBalances.set(tx.accountId, balance);
        }
    }

    const totalAmount = Math.max(Math.abs(validation.totalDebits), Math.abs(validation.totalCredits));
    const displayType = journalPresenter.getJournalDisplayType(roundedTransactions, accountTypes);

    return {
        transactions: roundedTransactions,
        totalAmount,
        displayType,
        calculatedBalances,
        accountsToRebuild,
    };
}
