import type {
  AccountCardViewModel,
  AccountSectionViewModel,
} from '@/src/features/accounts/utils/transformAccounts';

export type AccountListRow =
  | { kind: 'section'; key: string; section: AccountSectionViewModel }
  | {
      kind: 'account';
      key: string;
      account: AccountCardViewModel;
      section: AccountSectionViewModel;
    };

/** Keep headers visible while collapsed cards leave the recycling list. */
export function buildAccountListRows(sections: AccountSectionViewModel[]): AccountListRow[] {
  return sections.flatMap(section => {
    const rows: AccountListRow[] = [{ kind: 'section', key: `section:${section.title}`, section }];
    if (!section.isCollapsed) {
      for (const account of section.data) {
        rows.push({ kind: 'account', key: `account:${account.id}`, account, section });
      }
    }
    return rows;
  });
}
