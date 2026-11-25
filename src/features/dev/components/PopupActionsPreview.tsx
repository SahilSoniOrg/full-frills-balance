import { AppButton, AppInput, AppText } from '@/src/components/core';
import { ConfirmDialog } from '@/src/components/overlays/ConfirmDialog';
import { FormBottomSheet } from '@/src/components/overlays/FormBottomSheet';
import { Inline, Stack } from '@/src/design-system';
import { useState } from 'react';

/** Live shared components, so theme and text-size changes exercise the actual popup styles. */
export function PopupActionsPreview() {
  const [example, setExample] = useState<'info' | 'confirm' | 'destructive' | 'sheet' | null>(null);
  const [note, setNote] = useState('Monthly household expenses');
  const close = () => setExample(null);
  const destructive = example === 'destructive';

  return (
    <Stack gap="md">
      <AppText color="secondary">
        Open an example to compare dialog and sheet actions in the selected theme. These examples
        never change your books.
      </AppText>
      <Inline gap="sm" flexWrap="wrap">
        <AppButton variant="secondary" onPress={() => setExample('info')}>
          Information
        </AppButton>
        <AppButton variant="secondary" onPress={() => setExample('confirm')}>
          Confirmation
        </AppButton>
        <AppButton variant="destructive-outline" onPress={() => setExample('destructive')}>
          Destructive
        </AppButton>
        <AppButton variant="secondary" onPress={() => setExample('sheet')}>
          Form sheet
        </AppButton>
      </Inline>
      <ConfirmDialog
        visible={example === 'info'}
        title="Your books are up to date"
        message="All recent entries have been reviewed."
        onClose={close}
        primaryAction={{ label: 'Got it', onPress: close }}
      />
      <ConfirmDialog
        visible={example === 'confirm' || destructive}
        title={destructive ? 'Delete this account?' : 'Archive this account?'}
        message={
          destructive
            ? 'Preview only. No account will be deleted. Type DELETE to enable the action.'
            : 'The account will be hidden from active lists. You can restore it later.'
        }
        onClose={close}
        requiredConfirmationValue={destructive ? 'DELETE' : undefined}
        primaryAction={{
          label: destructive ? 'Delete account' : 'Archive account',
          variant: destructive ? 'destructive' : 'primary',
          onPress: close,
        }}
        secondaryAction={{ label: 'Cancel', onPress: close }}
      />
      <FormBottomSheet
        visible={example === 'sheet'}
        title="Edit note"
        doneLabel="Done"
        onClose={close}
      >
        <AppInput
          value={note}
          onChangeText={setNote}
          accessibilityLabel="Preview note"
          placeholder="Add a note"
          multiline
        />
      </FormBottomSheet>
    </Stack>
  );
}
