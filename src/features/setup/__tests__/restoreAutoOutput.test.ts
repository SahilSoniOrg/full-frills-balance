import { asWorkplaceId } from '@/src/types/ids';
import {
  getRestoreAppearancePrefill,
  getRestoreAutoOutput,
  getRestoreWorkplacePrefill,
} from '../restoreAutoOutput';
import type { RestoreSetupDraft, RestoreSourceOutput } from '../setupTypes';

const operationId = asWorkplaceId('operation');

function restore(source: RestoreSourceOutput): RestoreSetupDraft {
  return {
    schemaVersion: 1,
    kind: 'restore',
    journeyId: 'first_run_restore',
    entryPolicy: 'blocking',
    operationId,
    presentedHistory: ['restore_source'],
    acceptedSlices: ['restore_source'],
    restore: { source },
  };
}

describe('getRestoreAutoOutput', () => {
  const completeSource = {
    source: { uri: 'file:///backup.json', name: 'backup.json', fingerprint: 'abc' },
    facts: {
      user: { name: 'Imported' },
      workplace: { name: 'Books', icon: 'briefcase', defaultCurrencyCode: 'usd' },
    },
  } satisfies NonNullable<RestoreSetupDraft['restore']['source']>;

  it('auto-completes Workplace only when imported identity and currency exist', () => {
    expect(getRestoreAutoOutput('workplace', restore(completeSource))).toMatchObject({
      name: { value: 'Books', source: 'imported' },
      baseCurrency: { value: 'USD', source: 'imported' },
      selectedAccounts: [],
    });
    expect(
      getRestoreAutoOutput(
        'workplace',
        restore({
          ...completeSource,
          facts: { workplace: { name: 'Books' } },
        }),
      ),
    ).toBeUndefined();
  });

  it('prefills present Workplace facts when currency is missing', () => {
    const draft = restore({
      ...completeSource,
      facts: { workplace: { name: 'Books', icon: 'briefcase' } },
    });
    expect(getRestoreWorkplacePrefill(draft)).toEqual({
      name: { value: 'Books', source: 'imported' },
      icon: { value: 'briefcase', source: 'imported' },
    });
    expect(getRestoreAutoOutput('workplace', draft)).toBeUndefined();
  });

  it('uses a typed candidate name persisted on the restore draft', () => {
    const draft: RestoreSetupDraft = {
      ...restore({
        ...completeSource,
        facts: { workplace: completeSource.facts.workplace },
      }),
      restore: {
        source: {
          ...completeSource,
          facts: { workplace: completeSource.facts.workplace },
        },
        deviceCandidate: { value: 'Typed', source: 'user_entered' },
      },
    };
    expect(getRestoreAutoOutput('device', draft)).toEqual({
      displayName: { value: 'Typed', source: 'user_entered' },
    });
  });

  it('leaves Device required when imported and candidate names are absent', () => {
    expect(getRestoreAutoOutput('device', restore(completeSource))).toEqual({
      displayName: { value: 'Imported', source: 'imported' },
    });
    expect(
      getRestoreAutoOutput(
        'device',
        restore({
          ...completeSource,
          facts: { workplace: completeSource.facts.workplace },
        }),
      ),
    ).toBeUndefined();
  });

  it('prefills imported appearance facts', () => {
    const draft = restore({
      ...completeSource,
      facts: {
        ...completeSource.facts,
        appearance: { themeId: 'ivy', fontId: 'ivy' },
      },
    });

    expect(getRestoreAppearancePrefill(draft)).toEqual({
      themeId: { value: 'ivy', source: 'imported' },
      fontId: { value: 'ivy', source: 'imported' },
    });
  });
});
