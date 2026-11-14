import { Icon } from '@/src/types/domainIcons';
import { AccountType } from '@/src/types/enums';
import { asAccountId, asWorkplaceId } from '@/src/types/ids';
import { prepareCashClarityInput } from '../prepareEffectiveDraft';
import {
  createCreationSession,
  parseCashClaritySetupDraft,
  serializeCashClaritySetupDraft,
} from '../creationSession';

jest.mock('@/src/data/database/idGenerator', () => ({ generator: () => 'generated-session-id' }));

describe('Cash Clarity creation session persistence', () => {
  it('keeps raw text authoritative and reconstructs only a transient numeric placeholder', () => {
    const base = createCreationSession({
      intent: 'first_run',
      context: 'unregistered_device',
      entryPolicy: 'blocking',
      currency: 'USD',
      workplaceName: 'Personal',
    });
    const session = {
      ...base,
      operationId: asWorkplaceId('stable-operation'),
      step: 'now' as const,
      draft: {
        ...base.draft,
        operationId: asWorkplaceId('stable-operation'),
        accounts: [{ id: 'bank-1', kind: 'bank' as const, name: 'Main', balance: 500 }],
      },
      editableInput: { amountTextById: { 'bank-1': '12x' }, deferredCollections: { income: true } },
    };

    const serialized = serializeCashClaritySetupDraft(session);
    const raw = JSON.parse(serialized) as { draft: { accounts: Array<Record<string, unknown>> } };
    expect(raw.draft.accounts[0]).not.toHaveProperty('balance');

    const restored = parseCashClaritySetupDraft(JSON.parse(serialized));
    expect(restored?.operationId).toBe('stable-operation');
    expect(restored?.editableInput.amountTextById['bank-1']).toBe('12x');
    expect(restored?.editableInput.deferredCollections?.income).toBe(true);
    expect(restored?.draft.accounts[0].balance).toBe(0);
    expect(prepareCashClarityInput(restored!.draft, restored!.editableInput, 'en-US').issues).toHaveLength(1);
  });

  it('rejects route data that tries to turn first-run into an optional workplace entry', () => {
    const session = createCreationSession({
      intent: 'first_run',
      context: 'unregistered_device',
      entryPolicy: 'blocking',
      currency: 'USD',
      workplaceName: 'Personal',
    });
    expect(parseCashClaritySetupDraft({ ...session, entryPolicy: 'optional' })).toBeUndefined();
  });

  it('retains accepted legacy definitions as metadata without assigning balances', () => {
    const session = createCreationSession({
      intent: 'add_workplace',
      context: 'registered_empty_device',
      entryPolicy: 'blocking',
      currency: 'USD',
      workplaceName: 'Personal',
    });
    const migrated = {
      ...session,
      draft: {
        ...session.draft,
        preservedStarterAccounts: [{ id: asAccountId('legacy-account'), name: 'Brokerage', type: AccountType.ASSET, icon: Icon.Briefcase }],
      },
    };
    const restored = parseCashClaritySetupDraft(JSON.parse(serializeCashClaritySetupDraft(migrated)));
    expect(restored?.draft.preservedStarterAccounts).toEqual(migrated.draft.preservedStarterAccounts);
    expect(restored?.draft.accounts).toEqual([]);
  });
});
