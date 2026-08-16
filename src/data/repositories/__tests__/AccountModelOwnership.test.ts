import { database } from '@/src/data/database/Database';
import { AccountType, WorkplaceId } from '@/src/types/domain';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { ValidationError } from '@/src/utils/errors';

describe('Account and Transaction Model Ownership Hardening (WP-1Q)', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('rejects account creation without workplaceId', async () => {
    await expect(
      accountRepository.create({
        name: 'No WP Account',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId: '' as any,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects planUpdate and update when account workplace does not match caller workplace', async () => {
    const acc1 = await accountRepository.create({
      name: 'Account WP1',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });

    await expect(
      accountRepository.planUpdate(acc1, { name: 'New Name' }, 'wp-2' as WorkplaceId),
    ).rejects.toThrow(/Account does not belong to the specified workplace/);

    await expect(
      accountRepository.update(acc1, { name: 'New Name' }, 'wp-2' as WorkplaceId),
    ).rejects.toThrow(/Account does not belong to the specified workplace/);
  });

  it('rejects planUpdate when update payload contains mismatched workplaceId', async () => {
    const acc1 = await accountRepository.create({
      name: 'Account WP1',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });

    await expect(
      accountRepository.planUpdate(
        acc1,
        { name: 'New Name', workplaceId: 'wp-2' as WorkplaceId },
        'wp-1' as WorkplaceId,
      ),
    ).rejects.toThrow(/Workplace mismatch in update payload/);
  });

  it('rejects transaction creation when payload workplaceId mismatches argument workplaceId', async () => {
    await expect(
      transactionRepository.create(
        {
          accountId: 'acc-1' as any,
          amount: 100,
          transactionType: 'DEBIT' as any,
          currencyCode: 'USD',
          workplaceId: 'wp-2' as WorkplaceId,
        },
        2,
        true,
        'wp-1' as WorkplaceId,
      ),
    ).rejects.toThrow(/Transaction workplaceId mismatch/);
  });
});
