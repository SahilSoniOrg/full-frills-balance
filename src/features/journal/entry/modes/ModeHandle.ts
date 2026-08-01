/**
 * Contract the active journal entry mode panel registers with the shell.
 * Covers submit (footer) and account application (picker); panels clear on unmount.
 * The shell only coordinates the picker — mode panels own how selected accounts apply.
 */
import { AccountId } from '@/src/types/domain';
export type ModeHandle = {
  submitLabel: string;
  isSubmitDisabled: boolean;
  submit: () => void;
  isSubmitting?: boolean;
  applyAccountToLine?: (lineId: string, accountId: AccountId) => void;
  resolveSelectedAccountId?: (lineId: string) => AccountId | undefined;
};
