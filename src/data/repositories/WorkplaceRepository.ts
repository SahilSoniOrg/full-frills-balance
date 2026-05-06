import { database } from '@/src/data/database/Database';
import Workplace from '@/src/data/models/Workplace';

export class WorkplaceRepository {
  private get workplaces() {
    return database.get<Workplace>('workplaces');
  }

  async create(data: {
    id?: string;
    name: string;
    icon: string;
    defaultCurrencyCode: string;
  }): Promise<Workplace> {
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

  async find(id: string): Promise<Workplace | undefined> {
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

  observeAll() {
    return this.workplaces.query().observe();
  }

  observeById(id: string) {
    return this.workplaces.findAndObserve(id);
  }
}

export const workplaceRepository = new WorkplaceRepository();
