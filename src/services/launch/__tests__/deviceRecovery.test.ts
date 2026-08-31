import { decideDeviceRecovery } from '../deviceRecovery';

describe('decideDeviceRecovery', () => {
  it('does nothing when the raw Device bag exists', () => {
    expect(
      decideDeviceRecovery({ deviceBagPresent: true, deviceClaimed: false, workplaceCount: 0 }),
    ).toEqual({
      kind: 'not_needed',
      shouldClaimDevice: false,
      shouldPersistDeviceDefaults: false,
    });
  });

  it('leaves the Device unclaimed when a missing bag has no Workplace', () => {
    expect(
      decideDeviceRecovery({ deviceBagPresent: false, deviceClaimed: false, workplaceCount: 0 }),
    ).toEqual({
      kind: 'recovered',
      shouldClaimDevice: false,
      shouldPersistDeviceDefaults: true,
    });
  });

  it.each([1, 2, 5])(
    'claims the Device when %s existing Workplace(s) prove legacy setup',
    workplaceCount => {
      expect(
        decideDeviceRecovery({
          deviceBagPresent: false,
          deviceClaimed: false,
          workplaceCount,
          userName: 'Sahil',
        }),
      ).toEqual({
        kind: 'recovered',
        shouldClaimDevice: true,
        shouldPersistDeviceDefaults: true,
      });
    },
  );

  it('does not claim a Device while imported onboarding is awaiting acknowledgement', () => {
    expect(
      decideDeviceRecovery({
        deviceBagPresent: true,
        deviceClaimed: false,
        workplaceCount: 1,
        onboardingStage: 'post_import',
      }),
    ).toEqual({
      kind: 'not_needed',
      shouldClaimDevice: false,
      shouldPersistDeviceDefaults: false,
    });
  });

  it('repairs a missing or whitespace-only User name for a claimed recovery', () => {
    expect(
      decideDeviceRecovery({
        deviceBagPresent: false,
        deviceClaimed: false,
        workplaceCount: 1,
        userName: '  ',
      }),
    ).toMatchObject({
      shouldClaimDevice: true,
      shouldPersistDeviceDefaults: true,
      userNameRepair: 'User',
    });
    expect(
      decideDeviceRecovery({ deviceBagPresent: false, deviceClaimed: false, workplaceCount: 1 }),
    ).toMatchObject({
      shouldClaimDevice: true,
      shouldPersistDeviceDefaults: true,
      userNameRepair: 'User',
    });
  });

  it('does not repair a User name during unclaimed recovery', () => {
    expect(
      decideDeviceRecovery({
        deviceBagPresent: false,
        deviceClaimed: false,
        workplaceCount: 0,
        userName: '',
      }),
    ).not.toHaveProperty('userNameRepair');
  });

  it('repairs an unclaimed existing Device when books already exist', () => {
    expect(
      decideDeviceRecovery({ deviceBagPresent: true, deviceClaimed: false, workplaceCount: 1 }),
    ).toMatchObject({
      kind: 'recovered',
      shouldClaimDevice: true,
      shouldPersistDeviceDefaults: false,
    });
  });
});
