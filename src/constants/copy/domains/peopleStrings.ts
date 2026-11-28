export const peopleStrings = {
  netBalance: (currency: string) => `Net balance · ${currency}`,
  owedToYou: 'Owed to you',
  youOwe: 'You owe',
  otherCurrencies: 'Other currencies',
  unlinkAccountTitle: 'Unlink account?',
  unlinkAccountMessage: (accountName: string, personName: string) =>
    `Remove “${accountName}” from ${personName}? The account stays in your books; only the person link is removed.`,
  unlinkAccountConfirm: 'Unlink',
  unlinkAccountSuccess: 'Account unlinked.',
  unlinkAccountFailed: 'Could not unlink account.',
} as const;
