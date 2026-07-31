/**
 * Submit-only contract the active journal entry mode panel registers with the shell.
 * Shell footer reads the current handle; panels clear on unmount.
 * Account application belongs to the active mode panel; the shell only coordinates the picker.
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
