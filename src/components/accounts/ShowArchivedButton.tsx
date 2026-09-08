import { IconButton } from '@/src/components/core';
import { AppConfig, Size } from '@/src/constants';
import { useArchiveVisibility } from '@/src/contexts/ArchiveVisibilityScope';
import { hasArchivedAccountsInList } from '@/src/utils/accountArchive';

type ArchiveAccountRef = { archivedAt?: Date | number | null };

export function ShowArchivedButton({ accounts }: { accounts: readonly ArchiveAccountRef[] }) {
  const { showArchived, setShowArchived } = useArchiveVisibility();
  const hasArchivedAccounts = hasArchivedAccountsInList(accounts);

  const label = showArchived
    ? AppConfig.strings.accounts.archive.hideArchived
    : AppConfig.strings.accounts.archive.showArchived;

  if (!hasArchivedAccounts && !showArchived) {
    return null;
  }

  return (
    <IconButton
      name="archive"
      size={Size.iconSm}
      variant={showArchived ? 'primary' : 'surface'}
      onPress={() => setShowArchived(!showArchived)}
      testID="show-archived-button"
      accessibilityLabel={label}
      accessibilityState={{ selected: showArchived }}
    />
  );
}
