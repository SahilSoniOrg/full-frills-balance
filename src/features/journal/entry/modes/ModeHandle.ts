/**
 * Submit-only contract the active journal entry mode panel registers with the shell.
 * Shell footer reads the current handle; panels clear on unmount.
 * Account apply, voice, and footer chrome are owned outside this registry.
 */
export type ModeHandle = {
  submitLabel: string;
  isSubmitDisabled: boolean;
  submit: () => void;
  isSubmitting?: boolean;
};
