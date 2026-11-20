import { Icon, AppInput, AppIcon, AppText, PressScaleTouchable } from '@/src/components/core';
import { ModalActions } from '@/src/components/overlays/ModalActions';
import { openAppearancePicker } from '@/src/components/overlays/appearancePickerSession';
import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { Size, Spacing } from '@/src/constants';
import type { IconName } from '@/src/types/domainIcons';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';

interface WorkplaceEditorModalProps {
  visible: boolean;
  name: string;
  icon: IconName;
  onClose: () => void;
  onSave: (name: string, icon: IconName) => void;
}

export function WorkplaceEditorModal({
  visible,
  name,
  icon,
  onClose,
  onSave,
}: WorkplaceEditorModalProps) {
  const { theme } = useTheme();
  const [pendingName, setPendingName] = useState(name);
  const [pendingIcon, setPendingIcon] = useState(icon);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const save = () => {
    const trimmedName = pendingName.trim();
    if (trimmedName) onSave(trimmedName, pendingIcon);
  };

  const openIconPicker = async () => {
    setIconPickerOpen(true);
    const result = await openAppearancePicker({
      mode: 'icon',
      selectedIcon: pendingIcon,
    });
    setIconPickerOpen(false);
    if (result) setPendingIcon(result.icon);
  };

  return (
    <ModalSurface
      keyboardAvoiding
      visible={visible && !iconPickerOpen}
      title="Edit workplace"
      onClose={onClose}
      fixedHeight={false}
      scrollable
      contentStyle={styles.content}
      footer={
        <ModalActions
          actions={[
            { label: 'Cancel', role: 'secondary', variant: 'ghost', onPress: onClose },
            {
              label: 'Save',
              onPress: save,
              disabled: !pendingName.trim(),
              testID: 'workplace-editor-save-button',
            },
          ]}
        />
      }
    >
      <AppInput
        label="Name"
        value={pendingName}
        onChangeText={setPendingName}
        autoFocus
        testID="workplace-editor-name-input"
      />
      <Stack gap="xs">
        <AppText variant="body" weight="medium">
          Icon
        </AppText>
        <PressScaleTouchable
          onPress={() => void openIconPicker()}
          accessibilityRole="button"
          accessibilityLabel="Change workplace icon"
          testID="workplace-editor-icon-button"
        >
          <Stack gap="xs" align="center">
            <Box
              background="surfaceSecondary"
              borderWidth={1}
              borderColor="border"
              width={72}
              height={72}
              borderRadius="full"
              alignItems="center"
              justifyContent="center"
            >
              <AppIcon name={pendingIcon} size={Size.xl} color="primary" />
              <Box
                position="absolute"
                right={-Spacing.xs}
                bottom={-Spacing.xs}
                background="primary"
                borderRadius="full"
                padding="xs"
              >
                <AppIcon name={Icon.Edit} size={Size.xs} color={theme.surface} />
              </Box>
            </Box>
            <AppText variant="caption" color="secondary">
              Change icon
            </AppText>
          </Stack>
        </PressScaleTouchable>
      </Stack>
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md },
});
