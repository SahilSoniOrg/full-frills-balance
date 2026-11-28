import {
  Icon,
  AppIcon,
  AppText,
  IconName,
  IvyIcon,
  PressScaleTouchable,
} from '@/src/components/core';
import { ModalActions } from '@/src/components/overlays/ModalActions';
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
import { AccountType } from '@/src/types/enums';
import { useTheme } from '@/src/hooks/use-theme';
import { resolveAccountAppearance } from '@/src/design-system/accountPresentation';
import { isValidHexColor, withOpacity } from '@/src/design-system/colorMath';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { AppearancePickerMode } from '@/src/components/overlays/appearancePickerSession';

type AppearanceTab = 'icon' | 'color';

export interface AppearancePickerViewProps {
  onClose: () => void;
  onIconSelect?: (icon: IconName) => void | Promise<void>;
  onColorSelect?: (color: string) => void | Promise<void>;
  onSave?: (updates: { icon: IconName; color: string }) => void | Promise<void>;
  selectedIcon?: IconName;
  selectedColor?: string;
  accountType?: AccountType;
  defaultAccentColor?: string;
  previewLabel?: string;
  defaultColorLabel?: string;
  mode?: AppearancePickerMode;
  title?: string;
  /** When false, omit the in-content title (screen chrome owns it). */
  showTitle?: boolean;
}

export function AppearancePickerView({
  onClose,
  onIconSelect,
  onColorSelect,
  onSave,
  selectedIcon = Icon.Wallet,
  selectedColor = '',
  accountType = AccountType.ASSET,
  defaultAccentColor,
  previewLabel = 'Selected account icon',
  defaultColorLabel,
  mode = 'both',
  title,
  showTitle = false,
}: AppearancePickerViewProps) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<AppearanceTab>(mode === 'color' ? 'color' : 'icon');
  const [draftIcon, setDraftIcon] = useState<IconName>(selectedIcon);
  const [draftColor, setDraftColor] = useState<string>(selectedColor);
  const [isSaving, setIsSaving] = useState(false);

  const effectiveIcon = mode === 'both' ? draftIcon : selectedIcon;
  const effectiveColor = mode === 'both' ? draftColor : selectedColor;

  const { accentColor: accountColor, categoryColor } = defaultAccentColor
    ? {
        accentColor:
          effectiveColor && isValidHexColor(effectiveColor) ? effectiveColor : defaultAccentColor,
        categoryColor: defaultAccentColor,
      }
    : resolveAccountAppearance({ accountType, color: effectiveColor }, theme);

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
      ? AppConfig.strings.common.iconPickerTitle
      : mode === 'color'
        ? 'Select Color'
        : 'Account appearance');

  const showPreview = mode === 'both';
  const showTabs = mode === 'both';
  const currentTab = mode === 'both' ? activeTab : mode;

  return (
    <View style={styles.root} testID="appearance-picker">
      {showTitle ? (
        <AppText variant="title" weight="semibold" style={styles.inlineTitle}>
          {resolvedTitle}
        </AppText>
      ) : null}

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
              label={previewLabel}
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
              <PressScaleTouchable
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
              </PressScaleTouchable>
            );
          })}
        </View>
      )}

      <ScrollView
        style={styles.pickerSection}
        contentContainerStyle={styles.pickerSectionContent}
        showsVerticalScrollIndicator={false}
      >
        {currentTab === 'icon' ? (
          <View style={styles.iconGrid}>
            {ACCOUNT_ICON_PALETTE.map(icon => {
              const selected = effectiveIcon === icon;
              return (
                <PressScaleTouchable
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
                </PressScaleTouchable>
              );
            })}
          </View>
        ) : (
          <View>
            <PressScaleTouchable
              onPress={() => void handleColorPress('')}
              style={styles.autoColorRow}
              accessibilityLabel={defaultColorLabel ?? 'Auto color (from account type)'}
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
                {defaultColorLabel ?? AppConfig.strings.accounts.form.colorAuto}
              </AppText>
            </PressScaleTouchable>
            <View style={styles.colorGrid}>
              {ACCOUNT_COLOR_PALETTE.map(color => {
                const selected = effectiveColor.toUpperCase() === color.toUpperCase();
                return (
                  <PressScaleTouchable
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
                    {selected && (
                      <AppIcon name={Icon.Check} size={Size.iconSm} color={theme.background} />
                    )}
                  </PressScaleTouchable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      <ModalActions
        layout="stacked"
        actions={[
          {
            label: mode === 'both' ? 'Done' : AppConfig.strings.common.cancel,
            role: mode === 'both' ? 'primary' : 'secondary',
            variant: mode === 'both' ? 'primary' : 'ghost',
            onPress: () => void handleDone(),
            disabled: isSaving,
            loading: isSaving,
          },
        ]}
      />
    </View>
  );
}

export function resolveAppearancePickerTitle(
  mode: AppearancePickerMode = 'both',
  title?: string,
): string {
  return (
    title ||
    (mode === 'icon'
      ? AppConfig.strings.common.iconPickerTitle
      : mode === 'color'
        ? 'Select Color'
        : 'Account appearance')
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  inlineTitle: { marginBottom: Spacing.md },
  preview: {
    minHeight: Size.appearancePreviewHeight,
    borderWidth: BorderWidth.thin,
    borderRadius: Shape.radius.xl,
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
    borderRadius: Shape.radius.xxl,
  },
  autoColorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  pickerSection: { flex: 1, minHeight: 0 },
  pickerSectionContent: { paddingBottom: Spacing.md },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm },
  swatch: {
    width: Size.xxl,
    height: Size.xxl,
    borderRadius: Shape.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  autoSwatch: { borderWidth: BorderWidth.thin },
});
