import { AppIcon, AppInput, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useMemo, useState } from 'react';
import { FlatList, Keyboard, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';

export interface SelectionOption<T extends string | number = string> {
  id: T;
  label: string;
  description?: string;
  icon?: string;
}

interface SelectionPickerSheetProps<T extends string | number> {
  visible: boolean;
  title: string;
  options: SelectionOption<T>[];
  selectedValue: T;
  searchPlaceholder?: string;
  onClose: () => void;
  onSelect: (value: T) => void;
}

export function SelectionPickerSheet<T extends string | number>({
  visible,
  title,
  options,
  selectedValue,
  searchPlaceholder = AppConfig.strings.common.searchPlaceholder,
  onClose,
  onSelect,
}: SelectionPickerSheetProps<T>) {
  const { theme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(
      o => o.label.toLowerCase().includes(query) || o.description?.toLowerCase().includes(query),
    );
  }, [options, searchQuery]);

  const closeAndReset = () => {
    setSearchQuery('');
    onClose();
  };

  const handleSelect = (value: T) => {
    onSelect(value);
    Keyboard.dismiss();
    closeAndReset();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={closeAndReset}>
      <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <AppText variant="subheading" weight="bold">
              {title}
            </AppText>
            <TouchableOpacity onPress={closeAndReset}>
              <AppIcon name="close" size={Size.iconMd} color={theme.text} />
            </TouchableOpacity>
          </View>

          {options.length > 10 && (
            <View style={styles.searchContainer}>
              <AppInput
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
                leftIcon="search"
              />
            </View>
          )}

          <FlatList
            keyboardShouldPersistTaps="always"
            data={filteredOptions}
            keyExtractor={item => String(item.id)}
            contentContainerStyle={{ paddingBottom: Spacing.xl }}
            renderItem={({ item }) => {
              const isSelected = selectedValue === item.id;
              return (
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    { borderBottomColor: theme.border },
                    isSelected && {
                      backgroundColor: withOpacity(theme.primary, Opacity.selection),
                    },
                  ]}
                  onPress={() => handleSelect(item.id)}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="body" weight={isSelected ? 'bold' : 'medium'}>
                      {item.label}
                    </AppText>
                    {item.description && (
                      <AppText variant="caption" color="secondary">
                        {item.description}
                      </AppText>
                    )}
                  </View>
                  {isSelected && <AppIcon name="checkCircle" size={18} color={theme.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '80%',
    borderTopLeftRadius: Shape.radius.r3,
    borderTopRightRadius: Shape.radius.r3,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
