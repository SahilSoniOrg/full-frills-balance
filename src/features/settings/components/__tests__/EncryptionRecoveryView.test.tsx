import { render, screen, fireEvent } from '@/src/utils/test-utils';
import { EncryptionRecoveryView } from '../EncryptionRecoveryView';
import type { useEncryptionRecovery } from '../../hooks/useEncryptionRecovery';
jest.mock('../SettingsLayout', () => ({
  SettingsLayout: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../hooks/useEncryptionRecovery', () => ({ useEncryptionRecovery: jest.fn() }));
type ViewModel = ReturnType<typeof useEncryptionRecovery>;
function vm(patch: Partial<ViewModel> = {}): ViewModel {
  return {
    state: { session: null, keys: null, packageReady: false, packageSaved: false },
    busy: false,
    message: null,
    hasGeneratedSecret: false,
    hasImportedSecret: false,
    hasImportedPackage: false,
    disabled: false,
    begin: jest.fn(),
    exportSecret: jest.fn(),
    verifySecret: jest.fn(),
    exportPackage: jest.fn(),
    reexportPackage: jest.fn(),
    verifyPackage: jest.fn(),
    discard: jest.fn(),
    pickSecret: jest.fn(),
    pickPackage: jest.fn(),
    recover: jest.fn(),
    retry: jest.fn(),
    clearSensitiveInputs: jest.fn(),
    useRetainedPackage: jest.fn(),
    forgetDevice: jest.fn(),
    ...patch,
  };
}
it('offers deliberate setup or existing-User recovery without creating anything on mount', () => {
  const model = vm(),
    onRecoverMode = jest.fn();
  render(<EncryptionRecoveryView vm={model} recoverMode={false} onRecoverMode={onRecoverMode} />);
  expect(model.begin).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('encryption-existing-user'));
  expect(onRecoverMode).toHaveBeenCalled();
});
it('unfinished setup resumes through saved-file verification rather than a second root', () => {
  const model = vm({
    state: { session: null, keys: { user: 'pending' }, packageReady: false, packageSaved: false },
  });
  render(<EncryptionRecoveryView vm={model} recoverMode={false} onRecoverMode={jest.fn()} />);
  expect(screen.queryByTestId('encryption-begin-user')).toBeNull();
  expect(screen.queryByTestId('encryption-export-secret')).toBeNull();
  fireEvent.press(screen.getByTestId('encryption-verify-secret'));
  expect(model.verifySecret).toHaveBeenCalled();
  expect(screen.getByTestId('encryption-discard-unfinished')).toBeOnTheScreen();
});
it('requires both independently selected files before fresh-install recovery', () => {
  render(<EncryptionRecoveryView vm={vm()} recoverMode onRecoverMode={jest.fn()} />);
  expect(screen.getByTestId('recovery-confirm')).toBeDisabled();
  // Native file selection backgrounds the app and clears any secret. Select
  // ciphertext first so the last picker can supply the short-lived secret.
  expect(screen.getByTestId('recovery-choose-secret')).toBeDisabled();
  expect(screen.getByTestId('recovery-choose-package')).toBeEnabled();
});
it('resumes pending ciphertext export and requires opening the saved package', () => {
  const model = vm({
    state: {
      session: null,
      keys: { user: 'ready', workplace: 'ready', writerAllowed: true },
      packageReady: true,
      packageSaved: false,
    },
  });
  render(<EncryptionRecoveryView vm={model} recoverMode={false} onRecoverMode={jest.fn()} />);
  expect(screen.queryByTestId('encryption-save-package')).toBeNull();
  fireEvent.press(screen.getByTestId('encryption-reexport-package'));
  expect(model.reexportPackage).toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('encryption-verify-package'));
  expect(model.verifyPackage).toHaveBeenCalled();
});
it('a recovered Device can re-export a package but is not offered fresh backup encryption', () => {
  const model = vm({
    state: {
      session: null,
      keys: { user: 'ready', workplace: 'ready', writerAllowed: false },
      packageReady: true,
      packageSaved: true,
    },
  });
  render(<EncryptionRecoveryView vm={model} recoverMode={false} onRecoverMode={jest.fn()} />);
  expect(screen.queryByTestId('encryption-save-package')).toBeNull();
  expect(screen.getByTestId('encryption-export-retained')).toBeOnTheScreen();
});
