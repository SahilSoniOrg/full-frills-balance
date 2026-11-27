import { FilterChipButton, Icon, type IconName } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { Inline } from '@/src/design-system';
import type { ComponentVariant } from '@/src/design-system/variants';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { personAccountRole } from '@/src/services/people/peopleLedgerReads';
import type { AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import { StyleSheet, View } from 'react-native';

type LinkedAccount = {
  account: {
    id: AccountId;
    name: string;
    accountType: AccountType;
    currencyCode: string;
    icon?: string | null;
    color?: string | null;
  };
  unassignedState: {
    ledgerBalanceInNormalDirection: number;
  };
};

type PersonBookRole = NonNullable<ReturnType<typeof personAccountRole>>;

type Props = {
  personName: string;
  linkedAccounts: readonly LinkedAccount[];
  onLink: () => void;
  formatAmount: (amount: number, currencyCode: string) => string;
};

/** Icon + spoken meaning + money tint for each person-book role. */
function bookPresentation(role: PersonBookRole): {
  icon: IconName;
  meaning: string;
  tone: ComponentVariant;
} {
  switch (role) {
    case 'receivable':
      return { icon: Icon.Wallet, meaning: "Money you'll get back", tone: 'income' };
    case 'payable':
      return { icon: Icon.ArrowUp, meaning: 'Money you need to give', tone: 'expense' };
    case 'expense':
      return { icon: Icon.TrendingDown, meaning: "Money you won't get back", tone: 'expense' };
    case 'income':
      return {
        icon: Icon.TrendingUp,
        meaning: "Money from them you don't return",
        tone: 'income',
      };
  }
}

function openAccount(linked: LinkedAccount) {
  const account = linked.account;
  AppNavigation.toAccountDetails(account.id, {
    preview: {
      name: account.name,
      balance: linked.unassignedState.ledgerBalanceInNormalDirection,
      currency: account.currencyCode,
      icon: account.icon ?? undefined,
      type: account.accountType,
      colorKey: account.color ?? undefined,
    },
  });
}

export function PersonLinkedAccountsSection({
  personName,
  linkedAccounts,
  onLink,
  formatAmount,
}: Props) {
  if (linkedAccounts.length === 0) {
    return (
      <View style={styles.strip} testID="person-linked-accounts-strip">
        <FilterChipButton
          icon={Icon.Plus}
          label="Link account"
          accessibilityLabel="Link existing account"
          onPress={onLink}
          testID="person-hero-empty-linked-accounts"
        />
      </View>
    );
  }

  return (
    <View style={styles.strip} testID="person-linked-accounts-strip">
      <Inline gap="sm" flexWrap="wrap" alignItems="center">
        {linkedAccounts.map(linked => {
          const role = personAccountRole(linked.account.accountType);
          if (!role) return null;
          const { icon, meaning, tone } = bookPresentation(role);
          const amount = formatAmount(
            linked.unassignedState.ledgerBalanceInNormalDirection,
            linked.account.currencyCode,
          );
          return (
            <FilterChipButton
              key={linked.account.id}
              icon={icon}
              label={amount}
              tone={tone}
              accessibilityLabel={`${meaning}: ${amount}. Open account for ${personName}`}
              onPress={() => openAccount(linked)}
              testID={`person-linked-account-${linked.account.id}`}
            />
          );
        })}
        <FilterChipButton
          icon={Icon.Plus}
          label="Link"
          accessibilityLabel="Link existing account"
          onPress={onLink}
          testID="person-hero-link-account-button"
        />
      </Inline>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
});
