import { database } from '@/src/data/database/Database';
import Workplace from '@/src/data/models/Workplace';
import { WorkplaceId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';
import { map } from 'rxjs/operators';
import { AccountType } from '@/src/types/enums';
import { IconName } from '@/src/types/domainIcons';
import { accountWriteRepository } from './account/AccountWriteRepository';
import {
  getBalanceCorrectionAccountInput,
  getOpeningBalancesAccountInput,
} from '@/src/services/accounts/accountSystemAccountInputs';

export class WorkplaceRepository {
  private get workplaces() {
    return database.get<Workplace>('workplaces');
  }

  async create(data: {
    id?: WorkplaceId;
    name: string;
    icon: string;
    defaultCurrencyCode: string;
  }): Promise<Workplace> {
    // 1. Guard against ID collisions when forcing specific identity
    if (data.id) {
      const existing = await this.find(data.id);
      if (existing) {
        throw new Error(`Workplace ID collision: ${data.id}`);
      }
    }

    return await database.write(async () => {
      return await this.workplaces.create(w => {
        if (data.id) {
          w._raw.id = data.id;
        }
        w.name = data.name.trim();
        w.icon = data.icon;
        w.defaultCurrencyCode = data.defaultCurrencyCode;
        w.createdAt = new Date();
        w.updatedAt = new Date();
      });
    });
  }

  async createWithStarterAccounts(data: {
    id: WorkplaceId;
    name: string;
    icon: IconName;
    defaultCurrencyCode: string;
    accounts: { name: string; type: AccountType; icon: IconName }[];
    categories: { name: string; type: AccountType; icon: IconName }[];
  }): Promise<Workplace> {
    const workplace = this.prepareCreate(data);
    const opening = accountWriteRepository.prepareCreateOps(
      getOpeningBalancesAccountInput(data.defaultCurrencyCode, data.id),
    );
    const correction = accountWriteRepository.prepareCreateOps(
      getBalanceCorrectionAccountInput(data.defaultCurrencyCode, data.id),
    );
    const accountOps = [...opening.ops, ...correction.ops];
    const names = new Set([
      opening.account.name.toLowerCase(),
      correction.account.name.toLowerCase(),
    ]);
    for (const starter of [...data.accounts, ...data.categories]) {
      const name = starter.name.trim();
      if (!name || names.has(name.toLowerCase())) continue;
      names.add(name.toLowerCase());
      accountOps.push(
        ...accountWriteRepository.prepareCreateOps({
          name,
          accountType: starter.type,
          currencyCode: data.defaultCurrencyCode,
          icon: starter.icon,
          workplaceId: data.id,
        }).ops,
      );
    }
    await database.write(async () => {
      await database.batch(workplace, ...accountOps);
    });
    return workplace;
  }

  /** Prepare a workplace row for a caller-owned database transaction. */
  prepareCreate(data: {
    id?: WorkplaceId;
    name: string;
    icon: string;
    defaultCurrencyCode: string;
  }): Workplace {
    return this.workplaces.prepareCreate(w => {
      if (data.id) w._raw.id = data.id;
      w.name = data.name.trim();
      w.icon = data.icon;
      w.defaultCurrencyCode = data.defaultCurrencyCode;
      w.createdAt = new Date();
      w.updatedAt = new Date();
    });
  }

  async find(id: WorkplaceId): Promise<Workplace | undefined> {
    try {
      return await this.workplaces.find(id);
    } catch {
      return undefined;
    }
  }

  async findAll(): Promise<Workplace[]> {
    return await this.workplaces.query().fetch();
  }

  async update(
    workplace: Workplace,
    data: Partial<{ name: string; icon: string; defaultCurrencyCode: string }>,
  ): Promise<void> {
    await database.write(async () => {
      await workplace.update(w => {
        if (data.name !== undefined) w.name = data.name;
        if (data.icon !== undefined) w.icon = data.icon;
        if (data.defaultCurrencyCode !== undefined)
          w.defaultCurrencyCode = data.defaultCurrencyCode;
        w.updatedAt = new Date();
      });
    });
  }

  async delete(workplace: Workplace): Promise<void> {
    await database.write(async () => {
      await workplace.markAsDeleted();
    });
  }

  async destroyPermanently(id: WorkplaceId): Promise<void> {
    const workplace = await this.find(id);
    if (!workplace) return;
    await database.write(async () => {
      await workplace.destroyPermanently();
    });
  }

  observeAll() {
    return this.workplaces.query().observe();
  }

  observeById(id: WorkplaceId) {
    return this.workplaces
      .query(Q.where('id', id))
      .observe()
      .pipe(map(workplaces => workplaces[0] ?? null));
  }
}

export const workplaceRepository = new WorkplaceRepository();
