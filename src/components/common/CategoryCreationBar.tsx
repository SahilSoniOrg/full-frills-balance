import { IconPickerModal } from '@/src/components/common/IconPickerModal';
import { AppIcon, AppInput, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

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

    const handleTypeChange = useCallback((type: 'INCOME' | 'EXPENSE') => {
        setCustomType(type);
        if (showTypeToggle) {
            setSelectedIcon(type === 'EXPENSE' ? defaultIcon : (defaultIcon === 'tag' ? 'trendingUp' : defaultIcon));
        }
    }, [showTypeToggle, defaultIcon]);

    return (
        <View style={styles.customInputContainer}>
            <View style={styles.inputRow}>
                <TouchableOpacity
                    style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => setIsIconPickerVisible(true)}
                    accessibilityLabel="Select icon"
                    accessibilityRole="button"
                >
                    <AppIcon name={selectedIcon} size={Size.sm} color={theme.primary} />
                </TouchableOpacity>

                <AppInput
                    placeholder={placeholder}
                    value={customName}
                    onChangeText={setCustomName}
                    containerStyle={styles.customInput}
                    accessibilityLabel="Custom item name"
                    onSubmitEditing={handleAddCustom}
                />

                <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: customName.trim() ? theme.primary : theme.border }]}
                    onPress={handleAddCustom}
                    disabled={!customName.trim()}
                    accessibilityLabel="Add item"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !customName.trim() }}
                >
                    <AppIcon name="add" size={Size.sm} color={theme.surface} />
                </TouchableOpacity>
            </View>

            {showTypeToggle && (
                <View style={styles.typeToggle}>
                    <TouchableOpacity
                        onPress={() => handleTypeChange('EXPENSE')}
                        style={[
                            styles.typeButton,
                            customType === 'EXPENSE' && { backgroundColor: withOpacity(theme.error, Opacity.soft), borderColor: theme.error }
                        ]}
                    >
                        <AppText variant="caption" style={{ color: customType === 'EXPENSE' ? theme.error : theme.textSecondary }}>
                            {typeLabels?.expense || 'Expense'}
                        </AppText>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => handleTypeChange('INCOME')}
                        style={[
                            styles.typeButton,
                            customType === 'INCOME' && { backgroundColor: withOpacity(theme.success, Opacity.soft), borderColor: theme.success }
                        ]}
                    >
                        <AppText variant="caption" style={{ color: customType === 'INCOME' ? theme.success : theme.textSecondary }}>
                            {typeLabels?.income || 'Income'}
                        </AppText>
                    </TouchableOpacity>
                </View>
            )}

            {isIconPickerVisible && (
                <IconPickerModal
                    visible={isIconPickerVisible}
                    onClose={() => setIsIconPickerVisible(false)}
                    onSelect={(icon) => setSelectedIcon(icon)}
                    selectedIcon={selectedIcon}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    customInputContainer: {
        marginBottom: Spacing.md,
        gap: Spacing.sm,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    customInput: {
        flex: 1,
        marginBottom: 0,
    },
    iconButton: {
        width: Size.inputMd,
        height: Size.inputMd,
        borderRadius: Shape.radius.r2,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButton: {
        width: Size.inputMd,
        height: Size.inputMd,
        borderRadius: Size.inputMd / 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    typeToggle: {
        flexDirection: 'row',
        gap: Spacing.sm,
        paddingLeft: Size.inputMd + Spacing.sm,
    },
    typeButton: {
        paddingVertical: 4,
        paddingHorizontal: Spacing.md,
        borderRadius: Shape.radius.r3,
        borderWidth: 1,
    },
});
