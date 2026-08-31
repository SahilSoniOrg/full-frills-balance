import { splitPreferenceBags } from '../splitPreferenceBags';

describe('splitPreferenceBags', () => {
  it('puts chrome on user, lock and active workplace on device, STS on workplace', () => {
    const { user, device, workplace } = splitPreferenceBags({
      userName: 'Sam',
      theme: 'dark',
      isAppLockEnabled: true,
      onboardingCompleted: true,
      activeWorkplaceId: 'wp-1',
      safeToSpendDays: 60,
      isSmsImportEnabled: true,
      dismissedPatternIds: ['p1'],
    });

    expect(user).toEqual(expect.objectContaining({ userName: 'Sam', theme: 'dark' }));
    expect(user).not.toHaveProperty('isAppLockEnabled');
    expect(device).toEqual(
      expect.objectContaining({
        isAppLockEnabled: true,
        onboardingCompleted: true,
        activeWorkplaceId: 'wp-1',
        isSmsImportEnabled: true,
      }),
    );
    expect(workplace).toEqual(
      expect.objectContaining({
        safeToSpendDays: 60,
        dismissedPatternIds: ['p1'],
      }),
    );
    expect(workplace).not.toHaveProperty('isSmsImportEnabled');
  });
});
