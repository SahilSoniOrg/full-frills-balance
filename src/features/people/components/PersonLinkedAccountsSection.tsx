import { FilterChipButton, Icon, type IconName } from '@/src/components/core';
import { Box, Inline } from '@/src/design-system';
import type { ComponentVariant } from '@/src/design-system/variants';
import { personAccountRole } from '@/src/services/people/peopleLedgerReads';
import type { AccountType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';

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
  onOpenAccount: (accountId: AccountId) => void;
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

export function PersonLinkedAccountsSection({
  personName,
  linkedAccounts,
  onLink,
  onOpenAccount,
  formatAmount,
}: Props) {
  if (linkedAccounts.length === 0) {
    return (
      <Box paddingHorizontal="xs" testID="person-linked-accounts-strip">
        <FilterChipButton
          icon={Icon.Plus}
          label="Link account"
          accessibilityLabel="Link existing account"
          onPress={onLink}
          testID="person-hero-empty-linked-accounts"
        />
      </Box>
    );
  }

  return (
    <Box paddingHorizontal="xs" testID="person-linked-accounts-strip">
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
              onPress={() => onOpenAccount(linked.account.id)}
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
    </Box>
  );
}
