import { IconPickerModal } from '@/src/components/overlays/IconPickerModal';
import { Icon, AppIcon, AppInput, AppText } from '@/src/components/core';
import type { IconName } from '@/src/types/domainIcons';
import { Opacity, Size, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Box, Inline, Stack } from '@/src/design-system';
export type CreationItemType = 'INCOME' | 'EXPENSE' | 'ASSET' | 'LIABILITY';

export interface CategoryCreationBarProps {
  placeholder: string;
  onAdd: (name: string, type: CreationItemType, icon: IconName) => void;
  defaultIcon?: IconName;
  showTypeToggle?: boolean;
  defaultType?: CreationItemType;
  typeLabels?: Partial<Record<'income' | 'expense' | 'asset' | 'liability', string>>;
  typeOptions?: { type: CreationItemType; label: string; color: string }[];
}

export const CategoryCreationBar: React.FC<CategoryCreationBarProps> = ({
  placeholder,
  onAdd,
  defaultIcon = Icon.Tag,
  showTypeToggle = false,
  typeLabels,
  defaultType,
  typeOptions,
}) => {
  const { theme } = useTheme();
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState<CreationItemType>(
    defaultType ?? (showTypeToggle ? 'EXPENSE' : 'EXPENSE'),
  );
  const [selectedIcon, setSelectedIcon] = useState<IconName>(defaultIcon);
  const [isIconPickerVisible, setIsIconPickerVisible] = useState(false);

  const handleAddCustom = useCallback(() => {
    if (!customName.trim()) return;
    const type = showTypeToggle ? customType : (defaultType ?? 'EXPENSE');
    onAdd(customName.trim(), type, selectedIcon);
    setCustomName('');
    setSelectedIcon(defaultIcon);
  }, [customName, showTypeToggle, customType, onAdd, selectedIcon, defaultIcon, defaultType]);

  const handleTypeChange = useCallback(
    (type: CreationItemType) => {
      setCustomType(type);
      if (showTypeToggle) {
        setSelectedIcon(type === 'INCOME' ? Icon.TrendingUp : defaultIcon);
      }
    },
    [showTypeToggle, defaultIcon],
  );

  return (
    <Stack space="sm">
      <Inline align="center" space="sm">
        <TouchableOpacity
          onPress={() => setIsIconPickerVisible(true)}
          accessibilityLabel="Select icon"
          accessibilityRole="button"
        >
          <Box
            width={Size.inputMd}
            height={Size.inputMd}
            borderRadius="r2"
            style={{ borderWidth: 1, borderColor: theme.border }}
            background="surface"
            justifyContent="center"
            alignItems="center"
          >
            <AppIcon name={selectedIcon} size={Size.sm} color={theme.primary} />
          </Box>
        </TouchableOpacity>

        <AppInput
          placeholder={placeholder}
          value={customName}
          onChangeText={setCustomName}
          containerStyle={{ flex: 1, marginBottom: 0 }}
          accessibilityLabel="Custom item name"
          onSubmitEditing={handleAddCustom}
        />

        <TouchableOpacity
          onPress={handleAddCustom}
          disabled={!customName.trim()}
          accessibilityLabel="Add item"
          accessibilityRole="button"
        >
          <Box
            width={Size.inputMd}
            height={Size.inputMd}
            borderRadius="full"
            background={customName.trim() ? 'primary' : 'border'}
            justifyContent="center"
            alignItems="center"
          >
            <AppIcon name={Icon.Add} size={Size.sm} color={theme.surface} />
          </Box>
        </TouchableOpacity>
      </Inline>

      {showTypeToggle && (
        <Inline space="sm" style={{ paddingLeft: Size.inputMd + 8 }}>
          {(
            typeOptions ?? [
              {
                type: 'EXPENSE' as const,
                label: typeLabels?.expense || 'Expense',
                color: theme.error,
              },
              {
                type: 'INCOME' as const,
                label: typeLabels?.income || 'Income',
                color: theme.success,
              },
            ]
          ).map(option => (
            <TouchableOpacity
              key={option.type}
              onPress={() => handleTypeChange(option.type)}
              accessibilityRole="radio"
              accessibilityState={{ selected: customType === option.type }}
              accessibilityLabel={option.label}
            >
              <Box
                paddingVertical={4}
                paddingHorizontal="md"
                borderRadius="r3"
                style={{
                  borderWidth: 1,
                  backgroundColor:
                    customType === option.type
                      ? withOpacity(option.color, Opacity.soft)
                      : 'transparent',
                  borderColor: customType === option.type ? option.color : 'transparent',
                }}
              >
                <AppText
                  variant="caption"
                  style={{
                    color: customType === option.type ? option.color : theme.textSecondary,
                  }}
                >
                  {option.label}
                </AppText>
              </Box>
            </TouchableOpacity>
          ))}
        </Inline>
      )}

      {isIconPickerVisible && (
        <IconPickerModal
          visible={isIconPickerVisible}
          onClose={() => setIsIconPickerVisible(false)}
          onSelect={icon => setSelectedIcon(icon)}
          selectedIcon={selectedIcon}
        />
      )}
    </Stack>
  );
};
