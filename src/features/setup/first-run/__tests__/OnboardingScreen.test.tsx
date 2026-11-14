import { act, fireEvent, render, screen } from '@/src/utils/test-utils';
import { Keyboard } from 'react-native';
import type { CreationLaunchEntry } from '@/src/contexts/CreationLaunchContext';
import type { SetupDraft } from '../../setupTypes';
import { OnboardingScreen } from '../OnboardingScreen';
import { createCreationSession } from '../creationSession';
import { asWorkplaceId } from '@/src/types/ids';

const mockSetupStore: { value: SetupDraft | undefined } = { value: undefined };
let mockLaunchEntry: CreationLaunchEntry = { intent: 'first_run', context: 'unregistered_device', entryPolicy: 'blocking' };
jest.mock('@/src/contexts/CreationLaunchContext', () => ({
  useCreationLaunch: () => ({ openCreatedWorkplace: jest.fn(async () => {}), entry: mockLaunchEntry }),
}));
jest.mock('../../SetupDraftStore', () => ({
  loadSetupDraft: () => mockSetupStore.value,
  saveSetupDraft: (value: SetupDraft) => { mockSetupStore.value = value; },
  clearSetupDraft: () => { mockSetupStore.value = undefined; },
  hasUnreadableSetupDraft: () => false,
  discardUnreadableSetupDraft: jest.fn(),
}));

jest.mock('@/src/components/core', () => {
  const { Text: NativeText, Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    AppText: ({ children, ...props }: { children?: React.ReactNode }) => <NativeText {...props}>{children}</NativeText>,
    AppButton: ({ children, onPress, testID }: { children?: React.ReactNode; onPress?: () => void; testID?: string }) => <Pressable onPress={onPress} testID={testID}><NativeText>{children}</NativeText></Pressable>,
    LoadingView: () => null,
  };
});

jest.mock('@/src/components/shared/MoneyText', () => {
  const { Text: NativeText } = jest.requireActual('react-native') as typeof import('react-native');
  return { MoneyText: ({ amount, ...props }: { amount: number }) => <NativeText {...props}>{amount}</NativeText> };
});

jest.mock('../../SetupCoordinator', () => ({ startFirstRunRestoreFromDeviceName: jest.fn() }));
jest.mock('../../setupFinishers', () => ({ finishDeviceSetup: jest.fn() }));
jest.mock('@/src/services/analytics', () => ({ analytics: { track: jest.fn(), trackConversion: jest.fn() } }));
jest.mock('@/src/services/legal/privacyPolicyAcceptance', () => ({
  acknowledgeCurrentPrivacyPolicy: jest.fn(),
  hasAcknowledgedCurrentPrivacyPolicy: () => true,
  subscribeToPrivacyPolicyAcknowledgement: () => () => {},
}));
jest.mock('@/src/utils/navigation', () => ({
  AppNavigation: { back: jest.fn(), toPrivacyNotice: jest.fn(), toSetupJourney: jest.fn() },
}));
jest.mock('../commitCashClarity', () => ({
  publishCashClarity: jest.fn(),
  recoverCashClarityPublication: jest.fn(async () => undefined),
  CashClarityPublicationError: class extends Error {
    readonly code = 'save_failed';
  },
}));

jest.mock('../scenes', () => {
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  const button = (testID: string, onPress: () => void) => <Pressable testID={testID} onPress={onPress} />;
  return {
    WelcomeScene: ({ onNameChange, onStart }: { onNameChange: (name: string) => void; onStart: () => void }) => (
      <>{button('name', () => onNameChange('Molly'))}{button('start', onStart)}</>
    ),
    CurrencyScene: ({ onContinue }: { onContinue: () => void }) => button('currency-continue', onContinue),
    MoneyScene: ({ onAccountsChange, onAmountTextChange, onContinue, onDefer }: {
      onAccountsChange: (accounts: unknown[]) => void;
      onAmountTextChange: (key: string, value: string | undefined) => void;
      onContinue: (heard: string) => void;
      onDefer: () => void;
    }) => (
      <>
        {button('add-account', () => {
          onAmountTextChange('bank-1', '500');
          onAccountsChange([{ id: 'bank-1', kind: 'bank', name: 'Bank', balance: 0 }]);
        })}
        {button('money-continue', () => onContinue('Got your money'))}
        {button('defer-accounts', () => { onDefer(); onContinue('No money entered'); })}
        {button('clear-raw', () => onAmountTextChange('bank-1', undefined))}
      </>
    ),
    IncomeScene: ({ onBack }: { onBack: () => void }) => button('income-back', onBack),
    ProtectScene: () => null,
    ReserveScene: () => null,
    ClarityScene: () => null,
  };
});

describe('OnboardingScreen durable parent session', () => {
  beforeEach(() => {
    mockSetupStore.value = undefined;
    mockLaunchEntry = { intent: 'first_run', context: 'unregistered_device', entryPolicy: 'blocking' };
    jest.useFakeTimers();
    jest.spyOn(Keyboard, 'addListener').mockReturnValue({ remove: jest.fn() } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts registered empty devices at currency with add-workplace intent', () => {
    mockLaunchEntry = { intent: 'add_workplace', context: 'registered_empty_device', entryPolicy: 'blocking' };
    render(<OnboardingScreen />);
    expect(screen.queryByTestId('name')).toBeNull();
    expect(screen.getByTestId('currency-continue')).toBeTruthy();
    const saved = mockSetupStore.value;
    if (saved?.kind !== 'cash_clarity') throw new Error('Expected a creation session');
    expect(saved.intent).toBe('add_workplace');
    expect(saved.context).toBe('registered_empty_device');
    expect(saved.entryPolicy).toBe('blocking');
  });

  it('composes amount text, account changes, and the following transition against the latest session', () => {
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByTestId('name'));
    fireEvent.press(screen.getByTestId('start'));
    fireEvent.press(screen.getByTestId('currency-continue'));

    fireEvent.press(screen.getByTestId('add-account'));
    const afterEdit = mockSetupStore.value;
    expect(afterEdit?.kind).toBe('cash_clarity');
    if (afterEdit?.kind !== 'cash_clarity') throw new Error('Expected a Cash Clarity session');
    expect(afterEdit.editableInput.amountTextById['bank-1']).toBe('500');
    expect(afterEdit.draft.accounts).toHaveLength(1);
    act(() => { jest.advanceTimersByTime(600); });
    expect(screen.getByTestId('onboarding-sts-change')).toHaveTextContent(/Bank added/);

    fireEvent.press(screen.getByTestId('money-continue'));
    const afterContinue = mockSetupStore.value;
    expect(afterContinue?.kind).toBe('cash_clarity');
    if (afterContinue?.kind !== 'cash_clarity') throw new Error('Expected a Cash Clarity session');
    expect(afterContinue.step).toBe('next');
    expect(afterContinue.editableInput.amountTextById['bank-1']).toBe('500');
    expect(afterContinue.draft.accounts[0].balance).toBe(0);
  });

  it('persists defer metadata and the next step without dropping rows or raw input', () => {
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByTestId('name'));
    fireEvent.press(screen.getByTestId('start'));
    fireEvent.press(screen.getByTestId('currency-continue'));
    fireEvent.press(screen.getByTestId('add-account'));
    fireEvent.press(screen.getByTestId('defer-accounts'));

    const saved = mockSetupStore.value;
    expect(saved?.kind).toBe('cash_clarity');
    if (saved?.kind !== 'cash_clarity') throw new Error('Expected a Cash Clarity session');
    expect(saved.step).toBe('next');
    expect(saved.editableInput.deferredCollections?.accounts).toBe(true);
    expect(saved.editableInput.amountTextById['bank-1']).toBe('500');
    expect(saved.draft.accounts).toHaveLength(1);
  });

  it('resumes the same operation, step, and raw input after remount', () => {
    const initial = createCreationSession({
      intent: 'first_run',
      context: 'unregistered_device',
      entryPolicy: 'blocking',
      currency: 'USD',
      workplaceName: 'Personal',
      displayName: 'Molly',
      operationId: asWorkplaceId('resume-operation'),
    });
    mockSetupStore.value = {
      ...initial,
      step: 'now',
      draft: {
        ...initial.draft,
        accounts: [{ id: 'bank-resume', kind: 'bank', name: 'Bank', balance: 0 }],
      },
      editableInput: { amountTextById: { 'bank-resume': '275' } },
    };

    render(<OnboardingScreen />);
    fireEvent.press(screen.getByTestId('onboarding-continue-button'));
    fireEvent.press(screen.getByTestId('money-continue'));

    const saved = mockSetupStore.value;
    expect(saved?.kind).toBe('cash_clarity');
    if (saved?.kind !== 'cash_clarity') throw new Error('Expected a Cash Clarity session');
    expect(saved.operationId).toBe('resume-operation');
    expect(saved.step).toBe('next');
    expect(saved.editableInput.amountTextById['bank-resume']).toBe('275');
  });

  it('deletes a raw edit key when a row is removed or its input is cleared', () => {
    render(<OnboardingScreen />);
    fireEvent.press(screen.getByTestId('name'));
    fireEvent.press(screen.getByTestId('start'));
    fireEvent.press(screen.getByTestId('currency-continue'));
    fireEvent.press(screen.getByTestId('add-account'));
    fireEvent.press(screen.getByTestId('clear-raw'));

    const saved = mockSetupStore.value;
    expect(saved?.kind).toBe('cash_clarity');
    if (saved?.kind !== 'cash_clarity') throw new Error('Expected a Cash Clarity session');
    expect(Object.prototype.hasOwnProperty.call(saved.editableInput.amountTextById, 'bank-1')).toBe(false);
  });
});
