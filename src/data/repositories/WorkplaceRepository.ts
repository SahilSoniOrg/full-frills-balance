import { database } from '@/src/data/database/Database';
import Workplace from '@/src/data/models/Workplace';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { catchError, of } from 'rxjs';
import { AccountType, AuditAction } from '@/src/types/enums';
import { IconName } from '@/src/types/domainIcons';
import { Q } from '@nozbe/watermelondb';
import { generator } from '@/src/data/database/idGenerator';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import type { AuditEventSource, AuditEventType } from '@/src/types/auditEvents';
import { accountWriteRepository } from './account/AccountWriteRepository';
import {
  getBalanceCorrectionAccountInput,
  getOpeningBalancesAccountInput,
} from './account/accountSystemAccountInputs';

const WORKPLACE_OBSERVE_COLUMNS = ['name', 'icon', 'default_currency_code', 'updated_at'] as const;

type WorkplaceFields = {
  name: string;
  icon: string;
  defaultCurrencyCode: string;
};

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

    const workplace = this.prepareCreate(data);
    await database.write(async () => {
      await database.batch(workplace, this.prepareCreatedAuditLog(workplace));
    });
    return workplace;
  }

  async createWithStarterAccounts(data: {
    id: WorkplaceId;
    name: string;
    icon: string;
    defaultCurrencyCode: string;
    accounts: { id?: AccountId; name: string; type: AccountType; icon: IconName }[];
    categories: { id?: AccountId; name: string; type: AccountType; icon: IconName }[];
  }): Promise<Workplace> {
    const workplace = this.prepareCreate(data);
    const setupCorrelationId =
      data.accounts.length + data.categories.length > 0 ? generator() : undefined;
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
        ...accountWriteRepository.prepareCreateOps(
          {
            id: starter.id,
            name,
            accountType: starter.type,
            currencyCode: data.defaultCurrencyCode,
            icon: starter.icon,
            workplaceId: data.id,
          },
          { audit: { correlationId: setupCorrelationId } },
        ).ops,
      );
    }
    await database.write(async () => {
      await database.batch(
        workplace,
        ...accountOps,
        this.prepareCreatedAuditLog(workplace, setupCorrelationId),
      );
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
    const workplaces = await this.workplaces.query(Q.where('id', id)).fetch();
    return workplaces[0];
  }

  async findAll(): Promise<Workplace[]> {
    return await this.workplaces.query().fetch();
  }

  async update(
    workplace: Workplace,
    data: Partial<{ name: string; icon: string; defaultCurrencyCode: string }>,
    audit: {
      source?: AuditEventSource;
      eventType?: AuditEventType;
      undoable?: boolean;
      revertsLogId?: string;
      expectedCurrent?: Partial<WorkplaceFields>;
    } = {},
  ): Promise<void> {
    await database.write(async () => {
      const current = await this.workplaces.find(workplace.id);
      const before: WorkplaceFields = {
        name: current.name,
        icon: current.icon,
        defaultCurrencyCode: current.defaultCurrencyCode,
      };
      for (const [field, expected] of Object.entries(audit.expectedCurrent ?? {})) {
        if (before[field as keyof WorkplaceFields] !== expected) {
          throw new Error(
            'This Workplace changed after the selected history entry. Refresh and review the latest change.',
          );
        }
      }

      const after: Partial<WorkplaceFields> = {};
      if (data.name !== undefined && data.name !== before.name) after.name = data.name;
      if (data.icon !== undefined && data.icon !== before.icon) after.icon = data.icon;
      if (
        data.defaultCurrencyCode !== undefined &&
        data.defaultCurrencyCode !== before.defaultCurrencyCode
      ) {
        after.defaultCurrencyCode = data.defaultCurrencyCode;
      }

      const update = current.prepareUpdate(w => {
        if (data.name !== undefined) w.name = data.name;
        if (data.icon !== undefined) w.icon = data.icon;
        if (data.defaultCurrencyCode !== undefined)
          w.defaultCurrencyCode = data.defaultCurrencyCode;
        w.updatedAt = new Date();
      });
      await database.batch(
        update,
        ...(Object.keys(after).length > 0
          ? [
              auditRepository.prepareLog(
                {
                  entityType: 'workplace',
                  entityId: workplace.id,
                  action: AuditAction.UPDATE,
                  eventType: audit.eventType ?? 'workplace.updated',
                  source: audit.source ?? 'app',
                  undoable:
                    audit.undoable ?? (audit.source === undefined || audit.source === 'app'),
                  revertsLogId: audit.revertsLogId,
                  changes: { before, after },
                },
                workplace.id,
              ),
            ]
          : []),
      );
    });
  }

  private prepareCreatedAuditLog(workplace: Workplace, correlationId?: string) {
    const after: WorkplaceFields = {
      name: workplace.name,
      icon: workplace.icon,
      defaultCurrencyCode: workplace.defaultCurrencyCode,
    };
    return auditRepository.prepareLog(
      {
        entityType: 'workplace',
        entityId: workplace.id,
        action: AuditAction.CREATE,
        eventType: 'workplace.created',
        source: 'app',
        correlationId,
        undoable: false,
        changes: { after },
      },
      workplace.id,
    );
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
    return this.workplaces.query().observeWithColumns([...WORKPLACE_OBSERVE_COLUMNS]);
  }

  observeById(id: WorkplaceId) {
    return this.workplaces.findAndObserve(id).pipe(catchError(() => of(null)));
  }
}

export const workplaceRepository = new WorkplaceRepository();
