import { AppButton, AppIcon, AppInput, IconName } from '@/src/components/core';
import { IconPickerModal } from '@/src/components/common/IconPickerModal';
import { ModalSurface } from '@/src/components/common/ModalSurface';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

interface CreateWorkplaceDialogProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, icon: IconName) => void;
  isCreating: boolean;
}

export function CreateWorkplaceDialog({
  visible,
  onClose,
  onCreate,
  isCreating,
}: CreateWorkplaceDialogProps) {
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>('briefcase');
  const [iconPickerVisible, setIconPickerVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setName('');
      setIcon('briefcase');
    }
  }, [visible]);

  const handleCreate = () => {
    if (name.trim()) {
      onCreate(name.trim(), icon);
    }
  };

  return (
    <>
      <ModalSurface
        visible={visible}
        title="Create Workplace"
        onClose={onClose}
        fixedHeight={false}
        scrollable={false}
        useNativeModal={false}
        footer={
          <View style={styles.footer}>
            <AppButton
              onPress={onClose}
              disabled={isCreating}
              variant="outline"
              style={{ flex: 1 }}
            >
              Cancel
            </AppButton>
            <AppButton
              onPress={handleCreate}
              disabled={!name.trim() || isCreating}
              style={{ flex: 1 }}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </AppButton>
          </View>
        }
      >
        <View style={styles.content}>
          <Pressable
            onPress={() => setIconPickerVisible(true)}
            style={[
              styles.iconButton,
              { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
            ]}
          >
            <AppIcon name={icon} size={28} color={theme.primary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppInput value={name} onChangeText={setName} placeholder="Workplace name" autoFocus />
          </View>
        </View>
      </ModalSurface>
      <IconPickerModal
        visible={iconPickerVisible}
        onClose={() => setIconPickerVisible(false)}
        onSelect={selectedIcon => {
          setIcon(selectedIcon);
          setIconPickerVisible(false);
        }}
        selectedIcon={icon}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
