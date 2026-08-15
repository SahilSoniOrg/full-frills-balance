import { ModalSurface } from '@/src/components/common/ModalSurface';
import { AppButton, AppIcon } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import {
  ACCOUNT_ICON_PALETTE,
  AppConfig,
  Opacity,
  Shape,
  Size,
  Spacing,
  withOpacity,
} from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export const IconPickerModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSelect: (icon: IconName) => void;
  selectedIcon: IconName;
}> = ({ visible, onClose, onSelect, selectedIcon }) => {
  const { theme } = useTheme();
  const [isSelecting, setIsSelecting] = useState(false);

  const selectIcon = async (icon: IconName) => {
    if (isSelecting) return;
    setIsSelecting(true);
    try {
      await onSelect(icon);
      onClose();
    } catch {
      // Keep the picker open. The caller owns error presentation.
    } finally {
      setIsSelecting(false);
    }
  };

  const { strings } = AppConfig;

  return (
    <ModalSurface
      visible={visible}
      onClose={onClose}
      title={strings.onboarding.iconPickerTitle}
      accessibilityCloseLabel="Close icon picker"
      footer={
        <AppButton variant="ghost" onPress={onClose} style={styles.cancelButton}>
          {AppConfig.strings.common.cancel}
        </AppButton>
      }
    >
      <View style={styles.iconGrid}>
        {ACCOUNT_ICON_PALETTE.map(icon => (
          <TouchableOpacity
            key={icon}
            style={[
              styles.modalIconButton,
              {
                backgroundColor:
                  selectedIcon === icon ? withOpacity(theme.primary, Opacity.soft) : 'transparent',
              },
            ]}
            onPress={() => {
              void selectIcon(icon);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Select icon ${icon}`}
          >
            <AppIcon
              name={icon}
              size={Size.iconLg}
              color={selectedIcon === icon ? theme.primary : theme.text}
            />
          </TouchableOpacity>
        ))}
      </View>
    </ModalSurface>
  );
};

const styles = StyleSheet.create({
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  modalIconButton: {
    width: Size.xxl,
    height: Size.xxl,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Shape.radius.r2,
  },
  cancelButton: {
    marginTop: Spacing.xs,
  },
});
