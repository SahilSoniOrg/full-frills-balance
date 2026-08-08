import { AccountArchiveCascadeModal } from '@/src/features/accounts/components/AccountArchiveCascadeModal';
import { AppConfig } from '@/src/constants';
import { AccountId, AccountType } from '@/src/types/domain';
import { defaultCascadeSelection, buildArchiveCascadeNodes } from '@/src/utils/accountArchive';
import { fireEvent, render, screen } from '@/src/utils/test-utils';

jest.mock('@/src/components/common/InfoSheet', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    InfoSheet: ({
      children,
      primaryAction,
      secondaryAction,
      title,
    }: {
      children: React.ReactNode;
      primaryAction?: { label: string; onPress: () => void; disabled?: boolean };
      secondaryAction?: { label: string; onPress: () => void };
      title: string;
    }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, title),
        children,
        secondaryAction
          ? React.createElement(
              Pressable,
              { onPress: secondaryAction.onPress },
              React.createElement(Text, null, secondaryAction.label),
            )
          : null,
        primaryAction
          ? React.createElement(
              Pressable,
              {
                onPress: primaryAction.disabled ? undefined : primaryAction.onPress,
                accessibilityState: { disabled: !!primaryAction.disabled },
              },
              React.createElement(Text, null, primaryAction.label),
            )
          : null,
      ),
  };
});

jest.mock('@/src/components/core', () => {
  const actual = jest.requireActual('@/src/components/core');
  const React = jest.requireActual('react');
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    ...actual,
    ListRow: ({ title, onPress }: { title: string; onPress?: () => void }) =>
      React.createElement(Pressable, { onPress }, React.createElement(Text, null, title)),
    AppIcon: () => null,
  };
});

const allAccounts = [
  {
    id: 'parent-a' as AccountId,
    name: 'Parent A',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    parentAccountId: undefined,
  },
  {
    id: 'child-a' as AccountId,
    name: 'Child A',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    parentAccountId: 'parent-a' as AccountId,
  },
  {
    id: 'parent-b' as AccountId,
    name: 'Parent B',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    parentAccountId: undefined,
  },
  {
    id: 'child-b' as AccountId,
    name: 'Child B',
    accountType: AccountType.ASSET,
    currencyCode: 'USD',
    parentAccountId: 'parent-b' as AccountId,
  },
];

describe('AccountArchiveCascadeModal', () => {
  it('resets selection when opened for a different root account', () => {
    const onConfirm = jest.fn();

    const { rerender } = render(
      <AccountArchiveCascadeModal
        visible
        archiving
        rootAccountId={'parent-a' as AccountId}
        allAccounts={allAccounts}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.press(screen.getByText('Child A'));

    rerender(
      <AccountArchiveCascadeModal
        visible
        archiving
        rootAccountId={'parent-b' as AccountId}
        allAccounts={allAccounts}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    const expectedB = defaultCascadeSelection(
      buildArchiveCascadeNodes('parent-b' as AccountId, allAccounts),
      true,
    );
    fireEvent.press(screen.getByText(AppConfig.strings.common.confirm));

    expect(onConfirm).toHaveBeenCalledWith(expect.arrayContaining(['parent-b' as AccountId]));
    expect(onConfirm.mock.calls[0][0]).toEqual(expect.arrayContaining([...expectedB]));
    expect(onConfirm.mock.calls[0][0]).not.toContain('parent-a');
  });

  it('disables confirm when every account is deselected', () => {
    const onConfirm = jest.fn();

    render(
      <AccountArchiveCascadeModal
        visible
        archiving
        rootAccountId={'parent-a' as AccountId}
        allAccounts={allAccounts}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.press(screen.getByText('Parent A'));
    fireEvent.press(screen.getByText('Child A'));
    fireEvent.press(screen.getByText(AppConfig.strings.common.confirm));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms selected ids when at least one account remains checked', () => {
    const onConfirm = jest.fn();

    render(
      <AccountArchiveCascadeModal
        visible
        archiving
        rootAccountId={'parent-a' as AccountId}
        allAccounts={allAccounts}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.press(screen.getByText('Child A'));
    fireEvent.press(screen.getByText(AppConfig.strings.common.confirm));

    expect(onConfirm).toHaveBeenCalledWith(['parent-a']);
  });
});
