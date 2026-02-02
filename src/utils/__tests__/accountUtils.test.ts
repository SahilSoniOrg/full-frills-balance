import { AccountType } from '@/src/data/models/Account';
import { getAccountSections, groupAccountsByType } from '@/src/utils/accountUtils';

describe('accountUtils', () => {
    const mockAccounts: any[] = [
        { id: '1', name: 'Cash', accountType: AccountType.ASSET, orderNum: 2 },
        { id: '2', name: 'Bank', accountType: AccountType.ASSET, orderNum: 1 },
        { id: '3', name: 'Credit Card', accountType: AccountType.LIABILITY, orderNum: 1 },
        { id: '4', name: 'Salary', accountType: AccountType.INCOME, orderNum: 1 },
        { id: '5', name: 'Rent', accountType: AccountType.EXPENSE, orderNum: 1 },
    ];

    describe('groupAccountsByType', () => {
        it('should group accounts by their types', () => {
            const groups = groupAccountsByType(mockAccounts as any);

            expect(groups[AccountType.ASSET]).toHaveLength(2);
            expect(groups[AccountType.LIABILITY]).toHaveLength(1);
            expect(groups[AccountType.INCOME]).toHaveLength(1);
            expect(groups[AccountType.EXPENSE]).toHaveLength(1);
            expect(groups[AccountType.EQUITY]).toHaveLength(0);
        });

        it('should handle case-insensitive account types', () => {
            const accountsWithLowerType = [
                { id: '1', name: 'Cash', accountType: 'asset' },
            ];
            const groups = groupAccountsByType(accountsWithLowerType as any);
            expect(groups[AccountType.ASSET]).toHaveLength(1);
        });
    });

    describe('getAccountSections', () => {
        it('should return sections in standard order', () => {
            const sections = getAccountSections(mockAccounts as any);

            expect(sections).toHaveLength(4); // No Equity
            expect(sections[0].title).toBe('Assets');
            expect(sections[1].title).toBe('Liabilities');
            expect(sections[2].title).toBe('Income');
            expect(sections[3].title).toBe('Expenses');
        });

        it('should sort accounts within sections by orderNum', () => {
            const sections = getAccountSections(mockAccounts as any);
            const assetData = sections[0].data;

            expect(assetData[0].name).toBe('Bank'); // orderNum 1
            expect(assetData[1].name).toBe('Cash'); // orderNum 2
        });

        it('should only include sections with accounts', () => {
            const partialAccounts = [
                { id: '1', name: 'Salary', accountType: AccountType.INCOME },
            ];
            const sections = getAccountSections(partialAccounts as any);

            expect(sections).toHaveLength(1);
            expect(sections[0].title).toBe('Income');
        });

        it('should handle missing orderNum', () => {
            const accountsNoOrder: any[] = [
                { id: '1', name: 'Z', accountType: AccountType.ASSET },
                { id: '2', name: 'A', accountType: AccountType.ASSET, orderNum: 1 },
            ];
            const sections = getAccountSections(accountsNoOrder);
            expect(sections[0].data[0].name).toBe('Z'); // 0 or undefined comes before 1 in (a-b) sort
        });
    });
});
