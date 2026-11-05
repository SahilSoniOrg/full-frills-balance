import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { AccountMatcherEditorView } from '../AccountMatcherEditorView';
import type { useAccountMatcherEditorViewModel } from '@/src/features/accounts/hooks/useAccountMatcherEditorViewModel';

jest.mock('@/src/components/core', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AppButton: ({
      children,
      onPress,
      accessibilityLabel,
      disabled,
      testID,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      accessibilityLabel?: string;
      disabled?: boolean;
      testID?: string;
    }) =>
      ReactModule.createElement(
        Pressable,
        { onPress, accessibilityLabel, disabled, testID },
        ReactModule.createElement(Text, null, children),
      ),
    AppIcon: () => ReactModule.createElement(View),
    PressScaleTouchable: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement(Pressable, props, children),
    AppCard: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, null, children),
    AppInput: () => ReactModule.createElement(View),
    AppSegmentedControl: ({
      options,
      value,
      onChange,
      testID,
    }: {
      options: { id: string; label: string }[];
      value: string;
      onChange: (id: string) => void;
      testID: string;
    }) =>
      ReactModule.createElement(
        View,
        { testID },
        options.map(option =>
          ReactModule.createElement(
            Pressable,
            {
              key: option.id,
              testID: `${testID}-${option.id}`,
              accessibilityState: { selected: value === option.id },
              onPress: () => onChange(option.id),
            },
            ReactModule.createElement(Text, null, option.label),
          ),
        ),
      ),
    AppText: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(Text, null, children),
    Icon: { MessageSquare: 'message' },
    ListGroup: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, null, children),
  };
});
jest.mock('@/src/components/forms', () => ({ FormRow: () => null }));
jest.mock('@/src/components/forms/EntityFormScreen', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    EntityFormScreen: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, null, children),
  };
});
jest.mock('@/src/components/shared/SectionLabel', () => ({ SectionLabel: () => null }));
jest.mock('@/src/design-system', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Stack: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(View, null, children),
  };
});
jest.mock('@/src/features/accounts/components/SelectableSmsText', () => ({
  SelectableSmsText: () => null,
  SmsBodyPreview: () => null,
}));
jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({ theme: { surfaceSecondary: '#fff' } }),
}));
jest.mock('@/src/utils/dateUtils', () => ({ formatDate: () => 'date' }));

const makeViewModel = () =>
  ({
    validation: { valid: true },
    isSaving: false,
    isValid: true,
    isEligible: true,
    isLoading: false,
    loadError: null,
    accountId: 'account-1',
    accountName: 'Main card',
    sender: '',
    setSender: jest.fn(),
    flow: 'either',
    setFlow: jest.fn(),
    fragmentsText: '',
    setFragmentsText: jest.fn(),
    isLoadingOlderMessages: false,
    olderMessagesError: null,
    olderMessages: [],
    olderMessagesLoaded: false,
    hasMoreOlderMessages: false,
    loadOlderMessages: jest.fn(),
    messages: [],
    selectMessage: jest.fn(),
    selectedExample: null,
    privateMode: false,
    inspectedDates: null,
    inspectedCount: 0,
    allSupportingExamplesAutoPosted: false,
    existingMatcher: null,
    existingCoverage: 0,
    draftCoverage: 0,
    supportingExamples: [],
    linkedMisses: [],
    overlaps: [],
    saveError: null,
    matcherId: undefined,
    proposalKey: undefined,
    save: jest.fn(),
    forget: jest.fn(),
  }) as unknown as ReturnType<typeof useAccountMatcherEditorViewModel>;

describe('AccountMatcherEditorView older-message affordance', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('uses the app flow control to declare this account’s role', () => {
    const vm = makeViewModel();
    render(
      <AccountMatcherEditorView
        vm={vm}
        chrome={{} as never}
        showOverlapWarning={false}
        onSave={jest.fn()}
        onResolveOverlap={jest.fn()}
        onForget={jest.fn()}
      />,
    );
    expect(screen.getByText('Flow on this account')).toBeTruthy();
    expect(screen.getByText('Leave this account’s incoming or outgoing role open.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('account-matcher-flow-incoming'));
    expect(vm.setFlow).toHaveBeenCalledWith('incoming');
  });

  it('shows Choose older messages in the picker on Android', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    render(
      <AccountMatcherEditorView
        vm={makeViewModel()}
        chrome={{} as never}
        showOverlapWarning={false}
        onSave={jest.fn()}
        onResolveOverlap={jest.fn()}
        onForget={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('choose-account-matcher-sms'));
    expect(screen.getByText('Choose older messages')).toBeTruthy();
    expect(screen.getByTestId('account-matcher-older-sms-picker')).toBeTruthy();
  });

  it('keeps app-available-only selection on iOS', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    render(
      <AccountMatcherEditorView
        vm={makeViewModel()}
        chrome={{} as never}
        showOverlapWarning={false}
        onSave={jest.fn()}
        onResolveOverlap={jest.fn()}
        onForget={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('choose-account-matcher-sms'));
    expect(screen.queryByText('Choose older messages')).toBeNull();
    expect(screen.queryByTestId('account-matcher-older-sms-picker')).toBeNull();
  });
});
