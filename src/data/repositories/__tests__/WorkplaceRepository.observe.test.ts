import { Icon } from '@/src/types/domainIcons';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { accountQueryRepository } from '@/src/data/repositories/account/AccountQueryRepository';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { AccountType } from '@/src/types/enums';
import { asAccountId, asWorkplaceId, WorkplaceId } from '@/src/types/ids';
import { waitFor } from '@testing-library/react-native';
import { resetDatabase } from '@/src/testing/resetDatabase';

describe('WorkplaceRepository observation', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 15000);

  it('re-emits observeById when name or icon changes', async () => {
    const workplace = await workplaceRepository.create({
      name: 'Household',
      icon: Icon.Home,
      defaultCurrencyCode: 'USD',
    });

    const snapshots: { name?: string; icon?: string }[] = [];
    const subscription = workplaceRepository.observeById(workplace.id).subscribe(item => {
      snapshots.push({ name: item?.name, icon: item?.icon });
    });

    await waitFor(() => expect(snapshots).toHaveLength(1));
    await workplaceRepository.update(workplace, { name: 'Studio', icon: Icon.Briefcase });
    await waitFor(() => expect(snapshots).toHaveLength(2));
    subscription.unsubscribe();

    expect(snapshots[0]).toEqual({ name: 'Household', icon: Icon.Home });
    expect(snapshots[1]).toEqual({ name: 'Studio', icon: Icon.Briefcase });
  });

  it('re-emits observeAll when a workplace is renamed', async () => {
    const workplace = await workplaceRepository.create({
      id: 'wp-observe' as WorkplaceId,
      name: 'Household',
      icon: Icon.Home,
      defaultCurrencyCode: 'USD',
    });

    const snapshots: string[][] = [];
    const subscription = workplaceRepository.observeAll().subscribe(items => {
      snapshots.push(items.map(item => item.name));
    });

    await waitFor(() => expect(snapshots).toHaveLength(1));
    await workplaceRepository.update(workplace, { name: 'Studio' });
    await waitFor(() => expect(snapshots).toHaveLength(2));
    subscription.unsubscribe();

    expect(snapshots[0]).toEqual(['Household']);
    expect(snapshots[1]).toEqual(['Studio']);
  });

  it('gives setup accounts contiguous sibling order in entry order', async () => {
    const workplaceId = asWorkplaceId('wp-setup-order');
    await runAccountingWriteSession(session =>
      workplaceRepository.createSetupInSession(session, {
        id: workplaceId,
        name: 'Home',
        icon: Icon.Home,
        defaultCurrencyCode: 'USD',
        accounts: [
          {
            id: asAccountId('checking'),
            name: 'Checking',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
            workplaceId,
          },
          {
            id: asAccountId('cash'),
            name: 'Cash',
            accountType: AccountType.ASSET,
            currencyCode: 'USD',
            workplaceId,
          },
        ],
      }),
    );

    const accounts = await accountQueryRepository.findAll(workplaceId);
    const assets = accounts
      .filter(account => account.accountType === AccountType.ASSET)
      .sort((left, right) => (left.orderNum ?? 0) - (right.orderNum ?? 0));
    expect(assets.map(account => [account.name, account.orderNum])).toEqual([
      ['Checking', 0],
      ['Cash', 1],
    ]);
    const equity = accounts
      .filter(account => account.accountType === AccountType.EQUITY)
      .map(account => account.orderNum)
      .sort((left, right) => (left ?? 0) - (right ?? 0));
    expect(equity).toEqual([0, 1]);
  });
});
