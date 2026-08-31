import { AppButton, AppInput, AppIcon, AppText } from '@/src/components/core';
import { IconPickerModal } from '@/src/components/common/IconPickerModal';
import { ModalSurface } from '@/src/components/common/ModalSurface';
import { Size, Spacing } from '@/src/constants';
import type { IconName } from '@/src/types/domainIcons';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
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
  const [iconPickerVisible, setIconPickerVisible] = useState(false);

  const save = () => {
    const trimmedName = pendingName.trim();
    if (trimmedName) onSave(trimmedName, pendingIcon);
  };

  return (
    <>
      <ModalSurface
        visible={visible && !iconPickerVisible}
        title="Edit workplace"
        onClose={onClose}
        fixedHeight={false}
        scrollable={false}
        contentStyle={styles.content}
        footer={
          <Stack space="sm" style={styles.footer}>
            <AppButton
              variant="primary"
              onPress={save}
              disabled={!pendingName.trim()}
              testID="workplace-editor-save-button"
            >
              Save
            </AppButton>
            <AppButton variant="ghost" onPress={onClose}>
              Cancel
            </AppButton>
          </Stack>
        }
      >
        <AppInput
          label="Name"
          value={pendingName}
          onChangeText={setPendingName}
          autoFocus
          testID="workplace-editor-name-input"
        />
        <Stack space="xs">
          <AppText variant="body" weight="medium">
            Icon
          </AppText>
          <TouchableOpacity
            onPress={() => setIconPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Change workplace icon"
            testID="workplace-editor-icon-button"
          >
            <Stack space="xs" align="center">
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
                  <AppIcon name="edit" size={Size.xs} color={theme.surface} />
                </Box>
              </Box>
              <AppText variant="caption" color="secondary">
                Change icon
              </AppText>
            </Stack>
          </TouchableOpacity>
        </Stack>
      </ModalSurface>
      <IconPickerModal
        visible={iconPickerVisible}
        onClose={() => setIconPickerVisible(false)}
        onSelect={selectedIcon => {
          setPendingIcon(selectedIcon);
          setIconPickerVisible(false);
        }}
        selectedIcon={pendingIcon}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md },
  footer: { paddingTop: Spacing.md },
});
