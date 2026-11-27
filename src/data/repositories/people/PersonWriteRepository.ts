import { database } from '@/src/data/database/Database';
import Person from '@/src/data/models/Person';
import PersonAccount from '@/src/data/models/PersonAccount';
import OpenItem from '@/src/data/models/OpenItem';
import SettlementAllocation from '@/src/data/models/SettlementAllocation';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import {
  getStagedPersonAccounts,
  stageModelWrite,
  stagePersonAccountCreation,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import type { AccountId, JournalId, OpenItemId, PersonId, WorkplaceId } from '@/src/types/ids';
import { AuditAction } from '@/src/types/enums';
import type { IconName } from '@/src/types/domainIcons';
import { Q } from '@nozbe/watermelondb';
export type PersonProfileInput = {
  name: string;
  notes?: string;
  icon?: IconName;
  color?: string;
  defaultCurrencyCode?: string;
  paymentHandle?: string;
  phone?: string;
  email?: string;
  isPinned?: boolean;
};

export type PersonProfilePatch = Partial<PersonProfileInput>;

const trimOptionalText = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export class PersonWriteRepository {
  private people() {
    return database.collections.get<Person>('people');
  }
  private links() {
    return database.collections.get<PersonAccount>('person_accounts');
  }
  private items() {
    return database.collections.get<OpenItem>('open_items');
  }
  private allocations() {
    return database.collections.get<SettlementAllocation>('settlement_allocations');
  }
  private async person(w: WorkplaceId, id: PersonId) {
    const x = await this.people()
      .query(Q.where('workplace_id', w), Q.where('id', id), Q.where('deleted_at', Q.eq(null)))
      .fetch();
    if (!x[0]) throw new Error('Person not found in workplace');
    return x[0];
  }
  private async assertUniqueName(w: WorkplaceId, name: string, excludeId?: PersonId) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Name cannot be empty');
    const normalized = trimmed.toLocaleLowerCase();
    const existing = await this.people()
      .query(Q.where('workplace_id', w), Q.where('deleted_at', Q.eq(null)))
      .fetch();
    const conflict = existing.find(
      row => row.id !== excludeId && row.name.trim().toLocaleLowerCase() === normalized,
    );
    if (conflict) {
      throw new Error(`A person named "${trimmed}" already exists.`);
    }
    return trimmed;
  }
  async createPersonInSession(
    s: AccountingWriteSession,
    w: WorkplaceId,
    input: PersonProfileInput,
  ) {
    const name = await this.assertUniqueName(w, input.name);
    const notes = trimOptionalText(input.notes);
    const icon = input.icon;
    const color = trimOptionalText(input.color);
    const defaultCurrencyCode = trimOptionalText(input.defaultCurrencyCode)?.toUpperCase();
    const paymentHandle = trimOptionalText(input.paymentHandle);
    const phone = trimOptionalText(input.phone);
    const email = trimOptionalText(input.email);
    const isPinned = input.isPinned ?? false;
    const x = this.people().prepareCreate(r => {
      r.workplaceId = w;
      r.name = name;
      r.notes = notes;
      r.icon = icon;
      r.color = color;
      r.defaultCurrencyCode = defaultCurrencyCode;
      r.paymentHandle = paymentHandle;
      r.phone = phone;
      r.email = email;
      r.isPinned = isPinned;
      r.createdAt = new Date();
      r.updatedAt = new Date();
    });
    stageModelWrite(s, () => [
      x,
      auditRepository.prepareLog(
        {
          entityType: 'person',
          entityId: x.id,
          action: AuditAction.CREATE,
          changes: {
            name,
            notes,
            icon,
            color,
            defaultCurrencyCode,
            paymentHandle,
            phone,
            email,
            isPinned,
          },
          displayName: name,
        },
        w,
      ),
    ]);
    return x;
  }
  async updatePersonInSession(
    s: AccountingWriteSession,
    w: WorkplaceId,
    id: PersonId,
    patch: PersonProfilePatch,
  ) {
    const x = await this.person(w, id);
    const normalizedPatch: PersonProfilePatch = {};
    if ('name' in patch) {
      normalizedPatch.name = await this.assertUniqueName(w, patch.name ?? '', id);
    }
    if ('notes' in patch) normalizedPatch.notes = trimOptionalText(patch.notes);
    if ('icon' in patch) normalizedPatch.icon = patch.icon;
    if ('color' in patch) normalizedPatch.color = trimOptionalText(patch.color);
    if ('defaultCurrencyCode' in patch) {
      normalizedPatch.defaultCurrencyCode = trimOptionalText(
        patch.defaultCurrencyCode,
      )?.toUpperCase();
    }
    if ('paymentHandle' in patch) {
      normalizedPatch.paymentHandle = trimOptionalText(patch.paymentHandle);
    }
    if ('phone' in patch) normalizedPatch.phone = trimOptionalText(patch.phone);
    if ('email' in patch) normalizedPatch.email = trimOptionalText(patch.email);
    if ('isPinned' in patch) normalizedPatch.isPinned = Boolean(patch.isPinned);

    stageModelWrite(s, () => [
      x.prepareUpdate(r => {
        Object.assign(r, normalizedPatch);
        r.updatedAt = new Date();
      }),
      auditRepository.prepareLog(
        {
          entityType: 'person',
          entityId: id,
          action: AuditAction.UPDATE,
          changes: normalizedPatch,
          displayName: normalizedPatch.name ?? x.name,
        },
        w,
      ),
    ]);
    return x;
  }
  async setPersonArchivedInSession(
    s: AccountingWriteSession,
    w: WorkplaceId,
    id: PersonId,
    archived: boolean,
  ) {
    const x = await this.person(w, id);
    stageModelWrite(s, () => [
      x.prepareUpdate(r => {
        r.archivedAt = archived ? new Date() : undefined;
        r.updatedAt = new Date();
      }),
      auditRepository.prepareLog(
        { entityType: 'person', entityId: id, action: AuditAction.UPDATE, changes: { archived } },
        w,
      ),
    ]);
    return x;
  }
  async softDeletePersonInSession(s: AccountingWriteSession, w: WorkplaceId, id: PersonId) {
    const x = await this.person(w, id);
    stageModelWrite(s, () => [
      x.prepareUpdate(r => {
        r.deletedAt = new Date();
        r.updatedAt = new Date();
      }),
      auditRepository.prepareLog(
        {
          entityType: 'person',
          entityId: id,
          action: AuditAction.DELETE,
          changes: { deletedAt: true },
        },
        w,
      ),
    ]);
  }
  async linkAccountInSession(
    s: AccountingWriteSession,
    w: WorkplaceId,
    p: PersonId,
    a: AccountId,
    options?: { skipPersonLookup?: boolean },
  ) {
    if (!options?.skipPersonLookup) {
      await this.person(w, p);
    }
    const matches = await this.links()
      .query(
        Q.where('workplace_id', w),
        Q.where('account_id', a),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    if (matches.length || getStagedPersonAccounts(s, w).some(link => link.accountId === a)) {
      throw new Error('Account already linked to a person');
    }
    const x = this.links().prepareCreate(r => {
      r.workplaceId = w;
      r.personId = p;
      r.accountId = a;
      r.createdAt = new Date();
      r.updatedAt = new Date();
    });
    stagePersonAccountCreation(s, x, [x]);
    return x;
  }
  async unlinkAccountInSession(s: AccountingWriteSession, w: WorkplaceId, a: AccountId) {
    const xs = await this.links()
      .query(
        Q.where('workplace_id', w),
        Q.where('account_id', a),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    stageModelWrite(
      s,
      xs.map(x =>
        x.prepareUpdate(r => {
          r.deletedAt = new Date();
          r.updatedAt = new Date();
        }),
      ),
    );
  }
  async upsertOpenItemInSession(
    s: AccountingWriteSession,
    w: WorkplaceId,
    i: {
      personId: PersonId;
      originatingJournalId: JournalId;
      accountId: AccountId;
      direction: 'receivable' | 'payable';
      originalAmount: number;
      currencyCode: string;
    },
  ) {
    const rows = await this.items()
      .query(
        Q.where('workplace_id', w),
        Q.where('originating_journal_id', i.originatingJournalId),
        Q.where('account_id', i.accountId),
      )
      .fetch();
    let x = rows.find(r => !r.deletedAt);
    if (x) {
      stageModelWrite(s, () => [
        x!.prepareUpdate(r => {
          r.personId = i.personId;
          r.originatingJournalId = i.originatingJournalId;
          r.accountId = i.accountId;
          r.direction = i.direction;
          r.originalAmount = i.originalAmount;
          r.currencyCode = i.currencyCode;
          r.updatedAt = new Date();
        }),
      ]);
    } else {
      x = this.items().prepareCreate(r => {
        r.workplaceId = w;
        r.personId = i.personId;
        r.originatingJournalId = i.originatingJournalId;
        r.accountId = i.accountId;
        r.direction = i.direction;
        r.originalAmount = i.originalAmount;
        r.currencyCode = i.currencyCode;
        r.createdAt = new Date();
        r.updatedAt = new Date();
      });
      stageModelWrite(s, [x]);
    }
    return x;
  }
  async softDeleteOpenItemsInSession(
    s: AccountingWriteSession,
    w: WorkplaceId,
    ids: OpenItemId[],
    deletedAt = new Date(),
  ) {
    if (ids.length === 0) return;
    const xs = await this.items()
      .query(
        Q.where('workplace_id', w),
        Q.where('id', Q.oneOf(ids)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    stageModelWrite(s, () =>
      xs.map(x =>
        x.prepareUpdate(r => {
          r.deletedAt = deletedAt;
          r.updatedAt = deletedAt;
        }),
      ),
    );
  }
  async createSettlementAllocationsInSession(
    s: AccountingWriteSession,
    w: WorkplaceId,
    items: readonly {
      personId: PersonId;
      openItemId: OpenItemId;
      settlementJournalId: JournalId;
      accountId: AccountId;
      allocationKind: 'repayment' | 'write_off' | 'auto_settle';
      amount: number;
    }[],
  ) {
    if (items.length === 0) return [];
    const xs = items.map(i =>
      this.allocations().prepareCreate(r => {
        r.workplaceId = w;
        r.personId = i.personId;
        r.openItemId = i.openItemId;
        r.settlementJournalId = i.settlementJournalId;
        r.accountId = i.accountId;
        r.allocationKind = i.allocationKind;
        r.amount = i.amount;
        r.isActive = true;
        r.createdAt = new Date();
        r.updatedAt = new Date();
      }),
    );
    stageModelWrite(s, xs);
    return xs;
  }
  async deactivateSettlementAllocationsInSession(
    s: AccountingWriteSession,
    w: WorkplaceId,
    ids: string[],
    deactivatedAt = new Date(),
  ) {
    if (ids.length === 0) return;
    const xs = await this.allocations()
      .query(
        Q.where('workplace_id', w),
        Q.where('id', Q.oneOf(ids)),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();
    stageModelWrite(s, () =>
      xs.map(x =>
        x.prepareUpdate(r => {
          r.isActive = false;
          r.updatedAt = deactivatedAt;
        }),
      ),
    );
  }
}
export const personWriteRepository = new PersonWriteRepository();
