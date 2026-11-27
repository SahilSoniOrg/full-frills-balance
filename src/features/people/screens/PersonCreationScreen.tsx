import { EntityFormScreen } from '@/src/components/forms/EntityFormScreen';
import { UnderlineNameField } from '@/src/components/forms/UnderlineNameField';
import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { SectionLabel } from '@/src/components/shared/SectionLabel';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { Box, Stack } from '@/src/design-system';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { useConfirmUnsavedChanges } from '@/src/hooks/useConfirmUnsavedChanges';
import { createPerson } from '@/src/services/people';
import { toast } from '@/src/services/feedback/alerts';
import { useMemo, useState } from 'react';
import { AppText } from '@/src/components/core';

export function PersonCreationScreen() {
  const { workplaceId } = useWorkplace();
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [leaveAfterSave, setLeaveAfterSave] = useState<(() => void) | null>(null);
  const guard = useConfirmUnsavedChanges({
    fingerprint: name,
    baselineReady: true,
    shouldConfirm: Boolean(name.trim()),
    disabled: isSaving,
    leaveAfterSave,
    title: 'Discard new person?',
  });
  const chrome = useMemo<ScreenNavChrome>(
    () => ({
      screenTitle: 'Add person',
      kind: 'nav',
      onBack: guard.onBack,
    }),
    [guard.onBack],
  );

  const savePerson = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || isSaving) return;

    setIsSaving(true);
    try {
      await createPerson(workplaceId, { name: trimmedName });
      toast.success('Person added.');
      setLeaveAfterSave(() => AppNavigation.back);
    } catch (error) {
      setIsSaving(false);
      toast.error(error instanceof Error ? error.message : 'Could not add person.');
    }
  };

  return (
    <EntityFormScreen
      chrome={chrome}
      submitAction={{
        onPress: () => void savePerson(),
        label: 'Add person',
        disabled: !name.trim() || isSaving,
        requirementHint: 'Enter a person name to continue.',
      }}
    >
      <Box paddingHorizontal="lg">
        <Stack gap="sm">
          <SectionLabel label="Person name" marginTop="none" />
          <UnderlineNameField
            value={name}
            onChangeText={setName}
            placeholder="e.g. Pri"
            autoFocus
            testID="person-name-input"
          />
          <AppText variant="caption" color="secondary">
            Create an offline ledger profile to split bills, lend, or record repayments.
          </AppText>
        </Stack>
      </Box>
    </EntityFormScreen>
  );
}
