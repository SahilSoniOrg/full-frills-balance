import { ModalSurface } from '@/src/components/common/ModalSurface';
import { AppButton, AppIcon, AppText, IconName, IvyIcon } from '@/src/components/core';
import {
  ACCOUNT_COLOR_PALETTE,
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

const ICONS: IconName[] = [
  'tag',
  'trendingUp',
  'shoppingCart',
  'coffee',
  'bus',
  'film',
  'shoppingBag',
  'document',
  'home',
  'wallet',
  'bank',
  'safe',
  'creditCard',
  'briefcase',
  'circle',
  'copy',
  'receipt',
  'calendar',
  'search',
  'edit',
  'delete',
  'arrowUp',
  'arrowDown',
  'swapHorizontal',
];

export const AppearancePickerModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onIconSelect: (icon: IconName) => void;
  onColorSelect: (color: string) => void;
  selectedIcon: IconName;
  selectedColor: string;
  accountType: AccountType;
}> = ({
  visible,
  onClose,
  onIconSelect,
  onColorSelect,
  selectedIcon,
  selectedColor,
  accountType,
}) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<AppearanceTab>('icon');
  const { accentColor: accountColor, categoryColor } = useAccountColors({
    accountType,
    color: selectedColor,
  });

  return (
    <ModalSurface
      visible={visible}
      title="Account appearance"
      onClose={onClose}
      maxHeightPercent={82}
      fixedHeight={false}
      animationType="fade"
      accessibilityCloseLabel="Close account appearance"
      footer={
        <AppButton variant="primary" onPress={onClose} style={styles.doneButton}>
          Done
        </AppButton>
      }
    >
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
            name={selectedIcon}
            label="Selected account icon"
            color={accountColor}
            size={Size.avatarSm}
          />
        </View>
        <AppText variant="caption" color="secondary">
          Preview
        </AppText>
      </View>

      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        {(['icon', 'color'] as AppearanceTab[]).map(tab => {
          const selected = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[styles.tab, selected && { borderBottomColor: theme.primary }]}
            >
              <AppText variant="body" weight="semibold" color={selected ? 'primary' : 'secondary'}>
                {tab === 'icon' ? 'Icon' : 'Color'}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'icon' ? (
        <View style={styles.iconGrid}>
          {ICONS.map(icon => {
            const selected = selectedIcon === icon;
            return (
              <TouchableOpacity
                key={icon}
                onPress={() => onIconSelect(icon)}
                style={[
                  styles.iconButton,
                  {
                    backgroundColor: selected
                      ? withOpacity(theme.primary, Opacity.soft)
                      : 'transparent',
                  },
                ]}
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
            onPress={() => onColorSelect('')}
            style={styles.autoColorRow}
            accessibilityLabel="Auto color (from account type)"
          >
            <View
              style={[
                styles.swatch,
                styles.autoSwatch,
                { borderColor: theme.border },
                !selectedColor && { borderColor: theme.primary, borderWidth: BorderWidth.focus },
              ]}
            />
            <AppText variant="body" color={!selectedColor ? 'primary' : 'secondary'}>
              {AppConfig.strings.accounts.form.colorAuto}
            </AppText>
          </TouchableOpacity>
          <View style={styles.colorGrid}>
            {ACCOUNT_COLOR_PALETTE.map(color => {
              const selected = selectedColor.toUpperCase() === color.toUpperCase();
              return (
                <TouchableOpacity
                  key={color}
                  onPress={() => onColorSelect(color)}
                  style={[
                    styles.swatch,
                    { backgroundColor: color },
                    selected && { borderColor: theme.primary, borderWidth: BorderWidth.focus },
                  ]}
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
