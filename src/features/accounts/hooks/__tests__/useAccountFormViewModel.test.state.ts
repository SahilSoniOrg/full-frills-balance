import EventEmitter from 'react-native/Libraries/vendor/emitter/EventEmitter';
import { Keyboard } from 'react-native';
import type { AccountFields } from '@/src/types/plainDtos';

export const mockAccountFormVmState = {
  mockParams: {} as { type?: string; subtype?: string; accountId?: string; pIcon?: string },
  mockExistingAccount: null as AccountFields | null,
  mockAccounts: [] as AccountFields[],
  mockIsParent: false,
  mockPathname: '/account-creation',
};

export const mockOnSave = jest.fn();

export function resetAccountFormViewModelTestState(): void {
  const keyboardEmitter = new EventEmitter();
  jest
    .spyOn(Keyboard, 'addListener')
    .mockImplementation((event, listener) => keyboardEmitter.addListener(event, listener));
  mockAccountFormVmState.mockParams = {};
  mockAccountFormVmState.mockExistingAccount = null;
  mockAccountFormVmState.mockAccounts = [];
  mockAccountFormVmState.mockIsParent = false;
  mockOnSave.mockClear();
  mockAccountFormVmState.mockPathname = '/account-creation';
}
