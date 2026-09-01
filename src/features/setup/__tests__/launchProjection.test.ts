import { asWorkplaceId } from '@/src/types/ids';
import { clearSetupDraft, saveSetupDraft } from '../SetupDraftStore';
import { readBlockingSetupProjection } from '../readBlockingSetupProjection';
import { subscribeToSetupDraft } from '@/src/services/setup/launchProjection';

describe('Setup launch projection', () => {
  it('notifies launch when a blocking draft is cleared', () => {
    const onChange = jest.fn();
    const unsubscribe = subscribeToSetupDraft(onChange);
    saveSetupDraft({
      schemaVersion: 1,
      kind: 'first_run',
      journeyId: 'first_run',
      entryPolicy: 'blocking',
      operationId: asWorkplaceId('operation'),
      presentedHistory: [],
      acceptedSlices: [],
    });

    expect(
      readBlockingSetupProjection(
        JSON.stringify({
          schemaVersion: 1,
          kind: 'first_run',
          journeyId: 'first_run',
          entryPolicy: 'blocking',
          operationId: 'operation',
          presentedHistory: [],
          acceptedSlices: [],
        }),
      ),
    ).toEqual({
      journeyId: 'first_run',
      entryPolicy: 'blocking',
    });
    clearSetupDraft();
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('ignores optional drafts and unknown journeys', () => {
    expect(
      readBlockingSetupProjection(
        JSON.stringify({
          schemaVersion: 1,
          kind: 'restore',
          journeyId: 'settings_restore',
          entryPolicy: 'optional',
          operationId: 'operation',
          presentedHistory: [],
          acceptedSlices: [],
          restore: {},
        }),
      ),
    ).toBeUndefined();
    expect(
      readBlockingSetupProjection(
        JSON.stringify({
          journeyId: 'not_a_journey',
          entryPolicy: 'blocking',
          operationId: 'operation',
        }),
      ),
    ).toEqual({ unreadable: true });
  });

  it('fails closed when stored JSON is not a valid Setup draft', () => {
    expect(readBlockingSetupProjection('{')).toEqual({ unreadable: true });
    expect(
      readBlockingSetupProjection(
        JSON.stringify({
          journeyId: 'first_run',
          entryPolicy: 'blocking',
          operationId: 'operation',
        }),
      ),
    ).toEqual({ unreadable: true });
  });
});
