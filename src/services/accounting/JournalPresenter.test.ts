import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { JournalDisplayType } from '@/src/types/domain';
import { journalPresenter, SemanticType } from '@/src/utils/journalPresenter';

describe('JournalPresenter', () => {
    const accountTypes = new Map<string, AccountType>([
        ['a1', AccountType.ASSET],
        ['a2', AccountType.ASSET],
        ['l1', AccountType.LIABILITY],
        ['e1', AccountType.EQUITY],
        ['i1', AccountType.INCOME],
        ['ex1', AccountType.EXPENSE],
    ]);

    describe('getJournalDisplayType', () => {
        it('identifies INCOME when an Income account is involved', () => {
            const txs = [
                { accountId: 'a1', transactionType: TransactionType.DEBIT },
                { accountId: 'i1', transactionType: TransactionType.CREDIT },
            ];
            expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(JournalDisplayType.INCOME);
        });

        it('identifies EXPENSE when an Expense account is involved', () => {
            const txs = [
                { accountId: 'ex1', transactionType: TransactionType.DEBIT },
                { accountId: 'a1', transactionType: TransactionType.CREDIT },
            ];
            expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(JournalDisplayType.EXPENSE);
        });

        it('identifies MIXED when both Income and Expense accounts are involved', () => {
            const txs = [
                { accountId: 'i1', transactionType: TransactionType.CREDIT },
                { accountId: 'ex1', transactionType: TransactionType.DEBIT },
            ];
            expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(JournalDisplayType.MIXED);
        });

        it('identifies TRANSFER for simple Asset-to-Asset movements', () => {
            const txs = [
                { accountId: 'a1', transactionType: TransactionType.CREDIT },
                { accountId: 'a2', transactionType: TransactionType.DEBIT },
            ];
            expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(JournalDisplayType.TRANSFER);
        });

        it('identifies INCOME for Asset Debit vs Equity Credit (Investment)', () => {
            const txs = [
                { accountId: 'a1', transactionType: TransactionType.DEBIT },
                { accountId: 'e1', transactionType: TransactionType.CREDIT },
            ];
            expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(JournalDisplayType.INCOME);
        });

        it('identifies EXPENSE for Asset Credit vs Equity Debit (Owner Draw)', () => {
            const txs = [
                { accountId: 'a1', transactionType: TransactionType.CREDIT },
                { accountId: 'e1', transactionType: TransactionType.DEBIT },
            ];
            expect(journalPresenter.getJournalDisplayType(txs, accountTypes)).toBe(JournalDisplayType.EXPENSE);
        });
    });

    describe('getSemanticType', () => {
        it('identifies Asset -> Asset as Transfer', () => {
            expect(journalPresenter.getSemanticType(AccountType.ASSET, AccountType.ASSET)).toBe(SemanticType.TRANSFER);
        });

        it('identifies Income -> Asset as Income', () => {
            expect(journalPresenter.getSemanticType(AccountType.INCOME, AccountType.ASSET)).toBe(SemanticType.INCOME);
        });

        it('identifies Asset -> Expense as Expense', () => {
            expect(journalPresenter.getSemanticType(AccountType.ASSET, AccountType.EXPENSE)).toBe(SemanticType.EXPENSE);
        });

        it('identifies Asset -> Liability as Debt Payment', () => {
            expect(journalPresenter.getSemanticType(AccountType.ASSET, AccountType.LIABILITY)).toBe(SemanticType.DEBT_PAYMENT);
        });

        it('identifies Liability -> Asset as New Debt', () => {
            expect(journalPresenter.getSemanticType(AccountType.LIABILITY, AccountType.ASSET)).toBe(SemanticType.NEW_DEBT);
        });

        it('returns UNKNOWN for invalid types (though types are enforced)', () => {
            expect(journalPresenter.getSemanticType('INVALID' as any, AccountType.ASSET)).toBe(SemanticType.UNKNOWN);
        });
    });

    describe('getPresentation', () => {
        it('returns correct presentation for INCOME', () => {
            const pres = journalPresenter.getPresentation(JournalDisplayType.INCOME);
            expect(pres.colorKey).toBe('success');
            expect(pres.label).toBe('Income');
        });

        it('overrides label with semanticLabel if provided', () => {
            const pres = journalPresenter.getPresentation(JournalDisplayType.INCOME, 'Salary');
            expect(pres.label).toBe('Salary');
        });
    });

    describe('getIconLabel', () => {
        it('returns I for INCOME', () => {
            expect(journalPresenter.getIconLabel(JournalDisplayType.INCOME)).toBe('I');
        });
        it('returns E for EXPENSE', () => {
            expect(journalPresenter.getIconLabel(JournalDisplayType.EXPENSE)).toBe('E');
        });
        it('returns T for TRANSFER', () => {
            expect(journalPresenter.getIconLabel(JournalDisplayType.TRANSFER)).toBe('T');
        });
    });
});
