import { ModalSurface } from '@/src/components/common/ModalSurface';
import { AppButton, AppIcon, AppText, IconName, IvyIcon } from '@/src/components/core';
import {
  ACCOUNT_COLOR_PALETTE,
  ACCOUNT_ICON_PALETTE,
  AppConfig,
  BorderWidth,
  Opacity,
  Shape,
  Size,
  Spacing,
} from '@/src/constants';
import { AccountType } from '@/src/types/domain';
import { useTheme } from '@/src/hooks/use-theme';
import { useAccountColors } from '@/src/hooks/useAccountColors';
import { withOpacity } from '@/src/utils/color-math';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

type AppearanceTab = 'icon' | 'color';

export interface AppearancePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onIconSelect?: (icon: IconName) => void | Promise<void>;
  onColorSelect?: (color: string) => void | Promise<void>;
  onSave?: (updates: { icon: IconName; color: string }) => void | Promise<void>;
  selectedIcon?: IconName;
  selectedColor?: string;
  accountType?: AccountType;
  mode?: 'both' | 'icon' | 'color';
  title?: string;
}

export const AppearancePickerModal: React.FC<AppearancePickerModalProps> = ({
  visible,
  onClose,
  onIconSelect,
  onColorSelect,
  onSave,
  selectedIcon = 'wallet',
  selectedColor = '',
  accountType = AccountType.ASSET,
  mode = 'both',
  title,
}) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<AppearanceTab>(mode === 'color' ? 'color' : 'icon');
  const [draftIcon, setDraftIcon] = useState<IconName>(selectedIcon);
  const [draftColor, setDraftColor] = useState<string>(selectedColor);
  const [isSaving, setIsSaving] = useState(false);

  const effectiveIcon = mode === 'both' ? draftIcon : selectedIcon;
  const effectiveColor = mode === 'both' ? draftColor : selectedColor;

  const { accentColor: accountColor, categoryColor } = useAccountColors({
    accountType,
    color: effectiveColor,
  });

  const handleIconPress = async (icon: IconName) => {
    if (mode === 'both') {
      setDraftIcon(icon);
      onIconSelect?.(icon);
    } else {
      if (isSaving) return;
      setIsSaving(true);
      try {
        await onIconSelect?.(icon);
        onClose();
      } catch {
        // The caller owns error presentation. Keep open for retry.
        setIsSaving(false);
      }
    }
  };

  const handleColorPress = async (color: string) => {
    if (mode === 'both') {
      setDraftColor(color);
      onColorSelect?.(color);
    } else {
      if (isSaving) return;
      setIsSaving(true);
      try {
        await onColorSelect?.(color);
        onClose();
      } catch {
        // The caller owns error presentation. Keep open for retry.
        setIsSaving(false);
      }
    }
  };

  const handleDone = async () => {
    if (mode === 'both' && onSave) {
      if (isSaving) return;
      setIsSaving(true);
      try {
        await onSave({ icon: draftIcon, color: draftColor });
        onClose();
      } catch {
        // The caller owns error presentation. Keep open for retry.
        setIsSaving(false);
      }
    } else {
      onClose();
    }
  };

  const resolvedTitle =
    title ||
    (mode === 'icon'
      ? AppConfig.strings.onboarding.iconPickerTitle
      : mode === 'color'
        ? 'Select Color'
        : 'Account appearance');

  const showPreview = mode === 'both';
  const showTabs = mode === 'both';
  const currentTab = mode === 'both' ? activeTab : mode;

  return (
    <ModalSurface
      visible={visible}
      title={resolvedTitle}
      onClose={onClose}
      maxHeightPercent={82}
      fixedHeight={false}
      animationType="fade"
      accessibilityCloseLabel="Close appearance picker"
      footer={
        <AppButton
          variant={mode === 'both' ? 'primary' : 'ghost'}
          onPress={() => void handleDone()}
          style={styles.doneButton}
        >
          {mode === 'both' ? 'Done' : AppConfig.strings.common.cancel}
        </AppButton>
      }
    >
      {showPreview && (
        <View
          style={[
            styles.preview,
            {
              backgroundColor: withOpacity(accountColor, Opacity.soft),
              borderColor: categoryColor,
            },
          ]}
        >
          <View style={[styles.previewHalo, { borderColor: categoryColor }]}>
            <IvyIcon
              name={effectiveIcon}
              label="Selected account icon"
              color={accountColor}
              size={Size.avatarSm}
            />
          </View>
          <AppText variant="caption" color="secondary">
            Preview
          </AppText>
        </View>
      )}

      {showTabs && (
        <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
          {(['icon', 'color'] as AppearanceTab[]).map(tab => {
            const selected = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[styles.tab, selected && { borderBottomColor: theme.primary }]}
              >
                <AppText
                  variant="body"
                  weight="semibold"
                  color={selected ? 'primary' : 'secondary'}
                >
                  {tab === 'icon' ? 'Icon' : 'Color'}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {currentTab === 'icon' ? (
        <View style={styles.iconGrid}>
          {ACCOUNT_ICON_PALETTE.map(icon => {
            const selected = effectiveIcon === icon;
            return (
              <TouchableOpacity
                key={icon}
                onPress={() => void handleIconPress(icon)}
                style={[
                  styles.iconButton,
                  {
                    backgroundColor: selected
                      ? withOpacity(theme.primary, Opacity.soft)
                      : 'transparent',
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Select icon ${icon}`}
              >
                <AppIcon
                  name={icon}
                  size={Size.iconLg}
                  color={selected ? theme.primary : theme.text}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View>
          <TouchableOpacity
            onPress={() => void handleColorPress('')}
            style={styles.autoColorRow}
            accessibilityLabel="Auto color (from account type)"
            accessibilityRole="button"
          >
            <View
              style={[
                styles.swatch,
                styles.autoSwatch,
                { borderColor: theme.border },
                !effectiveColor && { borderColor: theme.primary, borderWidth: BorderWidth.focus },
              ]}
            />
            <AppText variant="body" color={!effectiveColor ? 'primary' : 'secondary'}>
              {AppConfig.strings.accounts.form.colorAuto}
            </AppText>
          </TouchableOpacity>
          <View style={styles.colorGrid}>
            {ACCOUNT_COLOR_PALETTE.map(color => {
              const selected = effectiveColor.toUpperCase() === color.toUpperCase();
              return (
                <TouchableOpacity
                  key={color}
                  onPress={() => void handleColorPress(color)}
                  style={[
                    styles.swatch,
                    { backgroundColor: color },
                    selected && { borderColor: theme.primary, borderWidth: BorderWidth.focus },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Color ${color}`}
                >
                  {selected && <AppIcon name="check" size={Size.iconSm} color={theme.background} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </ModalSurface>
  );
};

const styles = StyleSheet.create({
  preview: {
    minHeight: Size.appearancePreviewHeight,
    borderWidth: BorderWidth.thin,
    borderRadius: Shape.radius.r3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  previewHalo: {
    borderWidth: BorderWidth.medium,
    borderRadius: Shape.radius.full,
    padding: Spacing.xs,
  },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: Spacing.md },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm },
  iconButton: {
    width: Size.xxl,
    height: Size.xxl,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Shape.radius.r2,
  },
  autoColorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm },
  swatch: {
    width: Size.xxl,
    height: Size.xxl,
    borderRadius: Shape.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  autoSwatch: { borderWidth: BorderWidth.thin },
  doneButton: { marginTop: Spacing.md },
});
