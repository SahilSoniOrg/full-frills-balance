import { AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { ValidationError } from '@/src/utils/errors';
import { resetDatabase } from '@/src/testing/resetDatabase';

describe('Account Model Ownership Hardening (WP-1Q)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('rejects account creation without workplaceId', async () => {
    await expect(
      accountWriteRepository.create({
        name: 'No WP Account',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        workplaceId: '' as any,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects planUpdate and update when account workplace does not match caller workplace', async () => {
    const acc1 = await accountWriteRepository.create({
      name: 'Account WP1',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });

    await expect(
      accountWriteRepository.planUpdate(acc1, { name: 'New Name' }, 'wp-2' as WorkplaceId),
    ).rejects.toThrow(/Account does not belong to the specified workplace/);

    await expect(
      accountWriteRepository.update(acc1, { name: 'New Name' }, 'wp-2' as WorkplaceId),
    ).rejects.toThrow(/Account does not belong to the specified workplace/);
  });

  it('rejects planUpdate when update payload contains mismatched workplaceId', async () => {
    const acc1 = await accountWriteRepository.create({
      name: 'Account WP1',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      workplaceId: 'wp-1' as WorkplaceId,
    });

    await expect(
      accountWriteRepository.planUpdate(
        acc1,
        { name: 'New Name', workplaceId: 'wp-2' as WorkplaceId },
        'wp-1' as WorkplaceId,
      ),
    ).rejects.toThrow(/Workplace mismatch in update payload/);
  });
});
