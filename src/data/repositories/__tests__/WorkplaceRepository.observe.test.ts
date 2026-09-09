import { Icon } from '@/src/types/domainIcons';
import { database } from '@/src/data/database/Database';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { WorkplaceId } from '@/src/types/ids';
import { waitFor } from '@testing-library/react-native';

describe('WorkplaceRepository observation', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
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
});
