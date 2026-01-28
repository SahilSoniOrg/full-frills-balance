import { AppConfig } from '@/src/constants';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { JournalLineInput } from '@/src/services/accounting/JournalCalculator';
import { accountingService } from '@/src/services/AccountingService';
import { JournalEntryLine } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { sanitizeAmount } from '@/src/utils/validation';

export interface SubmitJournalResult {
    success: boolean;
    error?: string;
    action?: 'created' | 'updated';
}

export class JournalEntryService {
    async submitJournalEntry(
        lines: JournalEntryLine[],
        description: string,
        journalDate: string,
        journalTime: string,
        journalId?: string
    ): Promise<SubmitJournalResult> {
        const domainLines: JournalLineInput[] = lines.map(line => ({
            amount: sanitizeAmount(line.amount) || 0,
            type: line.transactionType,
            exchangeRate: line.exchangeRate ? parseFloat(line.exchangeRate) : 1
        }));

        // Validation
        const validation = accountingService.validateBalance(domainLines);
        if (!validation.isValid) {
            return { success: false, error: `Journal is not balanced. Discrepancy: ${validation.imbalance}` };
        }

        if (!description.trim()) {
            return { success: false, error: 'Description is required' };
        }

        if (lines.some(l => !l.accountId)) {
            return { success: false, error: 'All lines must have an account' };
        }

        const distinctValidation = accountingService.validateDistinctAccounts(lines.map(l => l.accountId));
        if (!distinctValidation.isValid) {
            return { success: false, error: 'A journal entry must involve at least 2 distinct accounts' };
        }

        try {
            // Merge Date and Time
            const combinedTimestamp = new Date(`${journalDate}T${journalTime}`).getTime();

            const journalData: CreateJournalData = {
                journalDate: combinedTimestamp,
                description: description.trim(),
                currencyCode: preferences.defaultCurrencyCode || AppConfig.defaultCurrency,
                transactions: lines.map(l => ({
                    accountId: l.accountId,
                    amount: sanitizeAmount(l.amount) || 0,
                    transactionType: l.transactionType,
                    notes: l.notes.trim() || undefined,
                    exchangeRate: l.exchangeRate ? parseFloat(l.exchangeRate) : undefined
                }))
            };

            if (journalId) {
                await journalRepository.updateJournalWithTransactions(journalId, journalData);
                return { success: true, action: 'updated' };
            } else {
                await journalRepository.createJournalWithTransactions(journalData);
                return { success: true, action: 'created' };
            }
        } catch (error) {
            logger.error('Failed to submit journal:', error);
            return { success: false, error: 'Failed to save transaction' };
        }
    }
}

export const journalEntryService = new JournalEntryService();
