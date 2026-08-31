import { asWorkplaceId } from '@/src/types/ids';
import { resolveLaunchGate } from '../launchResolver';

const wp1 = asWorkplaceId('wp-1');
const wp2 = asWorkplaceId('wp-2');

describe('resolveLaunch', () => {
  it.each([
    [false, [], undefined, { kind: 'device_onboarding' }, undefined],
    [true, [], undefined, { kind: 'workplace_creation' }, undefined],
    [true, [wp1], undefined, { kind: 'open', workplaceId: wp1, persistAsActive: true }, undefined],
    [true, [wp1, wp2], undefined, { kind: 'picker' }, undefined],
    [true, [wp1], wp1, { kind: 'open', workplaceId: wp1, persistAsActive: false }, undefined],
    [true, [wp1, wp2], wp2, { kind: 'open', workplaceId: wp2, persistAsActive: false }, undefined],
    [true, [wp1, wp2], wp1, { kind: 'open', workplaceId: wp2, persistAsActive: true }, wp2],
    [true, [wp1, wp2], asWorkplaceId('deleted'), { kind: 'picker' }, undefined],
  ])(
    'resolves claimed=%s workplaces=%j active=%s',
    (deviceClaimed, workplaceIds, activeWorkplaceId, expected, pendingWorkplaceId) => {
      expect(
        resolveLaunchGate({ deviceClaimed, workplaceIds, activeWorkplaceId, pendingWorkplaceId }),
      ).toEqual(expected);
    },
  );

  it('does not mutate the discovered ids', () => {
    const workplaceIds = [wp1, wp2] as const;
    resolveLaunchGate({ deviceClaimed: true, workplaceIds });
    expect(workplaceIds).toEqual([wp1, wp2]);
  });

  it('gives a blocking Setup draft precedence over Device and Workplace gates', () => {
    expect(
      resolveLaunchGate({
        setupDraft: { journeyId: 'first_run_restore', entryPolicy: 'blocking' },
        deviceClaimed: false,
        workplaceIds: [],
      }),
    ).toEqual({ kind: 'setup', journeyId: 'first_run_restore' });
  });

  it('does not let an optional Setup draft block normal launch', () => {
    expect(
      resolveLaunchGate({
        setupDraft: { journeyId: 'create_workplace', entryPolicy: 'optional' },
        deviceClaimed: true,
        workplaceIds: [wp1],
      }),
    ).toEqual({ kind: 'open', workplaceId: wp1, persistAsActive: true });
  });

  it('ignores an invalid empty Setup journey id', () => {
    expect(
      resolveLaunchGate({
        setupDraft: { journeyId: '   ', entryPolicy: 'blocking' },
        deviceClaimed: false,
        workplaceIds: [],
      }),
    ).toEqual({ kind: 'device_onboarding' });
  });
});
