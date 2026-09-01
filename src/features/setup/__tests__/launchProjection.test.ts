import { asWorkplaceId } from '@/src/types/ids';
import { clearSetupDraft, saveSetupDraft } from '../SetupDraftStore';
import {
  readBlockingSetupProjection,
  subscribeToSetupDraft,
} from '@/src/services/setup/launchProjection';

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
          journeyId: 'first_run',
          entryPolicy: 'blocking',
          operationId: 'operation',
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

  it('ignores optional and unknown drafts', () => {
    expect(
      readBlockingSetupProjection(
        JSON.stringify({
          journeyId: 'settings_restore',
          entryPolicy: 'optional',
          operationId: 'operation',
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
    ).toBeUndefined();
  });
});
