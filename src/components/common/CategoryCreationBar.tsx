import { IconPickerModal } from '@/src/components/common/IconPickerModal';
import { AppIcon, AppInput, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Opacity, Size, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback, useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { Box, Inline, Stack } from '@/src/design-system';

export interface CategoryCreationBarProps {
  placeholder: string;
  onAdd: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
  defaultIcon?: IconName;
  showTypeToggle?: boolean;
  typeLabels?: { income: string; expense: string };
}

export const CategoryCreationBar: React.FC<CategoryCreationBarProps> = ({
  placeholder,
  onAdd,
  defaultIcon = 'tag',
  showTypeToggle = false,
  typeLabels,
}) => {
  const { theme } = useTheme();
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [selectedIcon, setSelectedIcon] = useState<IconName>(defaultIcon);
  const [isIconPickerVisible, setIsIconPickerVisible] = useState(false);

  const handleAddCustom = useCallback(() => {
    if (!customName.trim()) return;
    const type = showTypeToggle ? customType : 'EXPENSE';
    onAdd(customName.trim(), type, selectedIcon);
    setCustomName('');
    setSelectedIcon(defaultIcon);
  }, [customName, showTypeToggle, customType, onAdd, selectedIcon, defaultIcon]);

  const handleTypeChange = useCallback(
    (type: 'INCOME' | 'EXPENSE') => {
      setCustomType(type);
      if (showTypeToggle) {
        setSelectedIcon(
          type === 'EXPENSE' ? defaultIcon : defaultIcon === 'tag' ? 'trendingUp' : defaultIcon,
        );
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
            <AppIcon name="add" size={Size.sm} color={theme.surface} />
          </Box>
        </TouchableOpacity>
      </Inline>

      {showTypeToggle && (
        <Inline space="sm" style={{ paddingLeft: Size.inputMd + 8 }}>
          <TouchableOpacity onPress={() => handleTypeChange('EXPENSE')}>
            <Box
              paddingVertical={4}
              paddingHorizontal="md"
              borderRadius="r3"
              style={{
                borderWidth: 1,
                backgroundColor:
                  customType === 'EXPENSE' ? withOpacity(theme.error, Opacity.soft) : 'transparent',
                borderColor: customType === 'EXPENSE' ? theme.error : 'transparent',
              }}
            >
              <AppText
                variant="caption"
                style={{ color: customType === 'EXPENSE' ? theme.error : theme.textSecondary }}
              >
                {typeLabels?.expense || 'Expense'}
              </AppText>
            </Box>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleTypeChange('INCOME')}>
            <Box
              paddingVertical={4}
              paddingHorizontal="md"
              borderRadius="r3"
              style={{
                borderWidth: 1,
                backgroundColor:
                  customType === 'INCOME'
                    ? withOpacity(theme.success, Opacity.soft)
                    : 'transparent',
                borderColor: customType === 'INCOME' ? theme.success : 'transparent',
              }}
            >
              <AppText
                variant="caption"
                style={{ color: customType === 'INCOME' ? theme.success : theme.textSecondary }}
              >
                {typeLabels?.income || 'Income'}
              </AppText>
            </Box>
          </TouchableOpacity>
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
