import { AppButton, AppIcon, AppInput, AppText } from '@/src/components/core';
import { IconMap, IconName } from '@/src/components/core/AppIcon';
import { Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { IconPickerModal } from './IconPickerModal';

export interface CategorySuggestion {
    name: string;
    icon: string;
    type: 'INCOME' | 'EXPENSE';
    isCustom?: boolean;
}

const DEFAULT_CATEGORIES: CategorySuggestion[] = ([
    { name: 'Salary', icon: 'trendingUp', type: 'INCOME' },
    { name: 'Work', icon: 'briefcase', type: 'INCOME' },
    { name: 'Food & Drink', icon: 'coffee', type: 'EXPENSE' },
    { name: 'Groceries', icon: 'shoppingCart', type: 'EXPENSE' },
    { name: 'Transportation', icon: 'bus', type: 'EXPENSE' },
    { name: 'Entertainment', icon: 'film', type: 'EXPENSE' },
    { name: 'Shopping', icon: 'shoppingBag', type: 'EXPENSE' },
    { name: 'Bills', icon: 'fileText', type: 'EXPENSE' },
] as const).map(cat => ({
    ...cat,
    icon: (IconMap[cat.icon as IconName] ? cat.icon : 'tag') as string
}));

interface StepCategorySuggestionsProps {
    selectedCategories: string[];
    customCategories: { name: string; type: 'INCOME' | 'EXPENSE'; icon: string }[];
    onToggleCategory: (name: string) => void;
    onAddCustomCategory: (name: string, type: 'INCOME' | 'EXPENSE', icon: string) => void;
    onContinue: () => void;
    onBack: () => void;
    isCompleting: boolean;
}

export const StepCategorySuggestions: React.FC<StepCategorySuggestionsProps> = ({
    selectedCategories,
    customCategories,
    onToggleCategory,
    onAddCustomCategory,
    onContinue,
    onBack,
    isCompleting,
}) => {
    const { theme } = useTheme();
    const [customName, setCustomName] = useState('');
    const [customType, setCustomType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
    const [selectedIcon, setSelectedIcon] = useState<IconName>('tag');
    const [isIconPickerVisible, setIsIconPickerVisible] = useState(false);

    const handleAddCustom = () => {
        if (!customName.trim()) return;
        onAddCustomCategory(customName.trim(), customType, selectedIcon);
        setCustomName('');
        setSelectedIcon(customType === 'EXPENSE' ? 'tag' : 'trendingUp');
    };

    const handleTypeChange = (type: 'INCOME' | 'EXPENSE') => {
        setCustomType(type);
        setSelectedIcon(type === 'EXPENSE' ? 'tag' : 'trendingUp');
    };

    const allSuggestions = [
        ...DEFAULT_CATEGORIES,
        ...customCategories.map(cat => ({
            name: cat.name,
            icon: cat.icon,
            type: cat.type,
            isCustom: true
        }))
    ];

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
            <AppText variant="title" style={styles.title}>
                Initial Categories
            </AppText>
            <AppText variant="body" color="secondary" style={styles.subtitle}>
                Choose starting categories or add your own.
            </AppText>

            <ScrollView
                style={styles.scrollContainer}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.grid}>
                    {allSuggestions.map((category) => {
                        const isSelected = selectedCategories.includes(category.name);
                        const behaviorColor = category.type === 'INCOME' ? theme.success : theme.error;

                        return (
                            <TouchableOpacity
                                key={category.name}
                                style={[
                                    styles.suggestionItem,
                                    {
                                        backgroundColor: isSelected ? behaviorColor + '20' : theme.surface,
                                        borderColor: isSelected ? behaviorColor : theme.border,
                                    }
                                ]}
                                onPress={() => onToggleCategory(category.name)}
                            >
                                <AppIcon
                                    name={category.icon as any}
                                    size={Size.sm}
                                    color={isSelected ? behaviorColor : theme.textSecondary}
                                />
                                <AppText
                                    variant="caption"
                                    numberOfLines={1}
                                    style={[
                                        styles.itemText,
                                        { color: isSelected ? behaviorColor : theme.text }
                                    ]}
                                >
                                    {category.name}
                                </AppText>
                                {isSelected && (
                                    <View style={[styles.checkBadge, { backgroundColor: behaviorColor }]}>
                                        <AppIcon name="checkCircle" size={12} color={theme.surface} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={styles.customInputContainer}>
                    <View style={styles.inputRow}>
                        <TouchableOpacity
                            style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                            onPress={() => setIsIconPickerVisible(true)}
                        >
                            <AppIcon name={selectedIcon} size={Size.sm} color={theme.primary} />
                        </TouchableOpacity>

                        <AppInput
                            placeholder="Add custom category..."
                            value={customName}
                            onChangeText={setCustomName}
                            containerStyle={styles.customInput}
                        />
                        <TouchableOpacity
                            style={[styles.addButton, { backgroundColor: theme.primary }]}
                            onPress={handleAddCustom}
                        >
                            <AppIcon name="add" size={Size.sm} color={theme.surface} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.typeToggle}>
                        <TouchableOpacity
                            onPress={() => handleTypeChange('EXPENSE')}
                            style={[
                                styles.typeButton,
                                customType === 'EXPENSE' && { backgroundColor: theme.error + '20', borderColor: theme.error }
                            ]}
                        >
                            <AppText variant="caption" style={{ color: customType === 'EXPENSE' ? theme.error : theme.textSecondary }}>Expense</AppText>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => handleTypeChange('INCOME')}
                            style={[
                                styles.typeButton,
                                customType === 'INCOME' && { backgroundColor: theme.success + '20', borderColor: theme.success }
                            ]}
                        >
                            <AppText variant="caption" style={{ color: customType === 'INCOME' ? theme.success : theme.textSecondary }}>Income</AppText>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            <IconPickerModal
                visible={isIconPickerVisible}
                onClose={() => setIsIconPickerVisible(false)}
                onSelect={(icon) => setSelectedIcon(icon)}
                selectedIcon={selectedIcon}
            />

            <View style={styles.buttonContainer}>
                <AppButton
                    variant="primary"
                    size="lg"
                    onPress={onContinue}
                    disabled={isCompleting}
                    style={styles.continueButton}
                >
                    Get Started
                </AppButton>
                <AppButton
                    variant="outline"
                    size="lg"
                    onPress={onBack}
                    disabled={isCompleting}
                >
                    Back
                </AppButton>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        flex: 1,
    },
    title: {
        textAlign: 'center',
        marginBottom: Spacing.sm,
    },
    subtitle: {
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: Spacing.xl,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
        justifyContent: 'flex-start',
    },
    suggestionItem: {
        width: '30%',
        aspectRatio: 1,
        borderRadius: 12,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.sm,
        position: 'relative',
        marginBottom: Spacing.xs,
    },
    itemText: {
        marginTop: Spacing.xs,
        textAlign: 'center',
        fontSize: 10,
    },
    checkBadge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#4CAF50',
        borderRadius: 10,
        padding: 2,
    },
    customInputContainer: {
        marginTop: Spacing.lg,
        gap: Spacing.sm,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    customInput: {
        flex: 1,
    },
    iconButton: {
        width: Size.buttonMd,
        height: Size.buttonMd,
        borderRadius: Shape.radius.r2,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButton: {
        width: Size.buttonMd,
        height: Size.buttonMd,
        borderRadius: Size.buttonMd / 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    typeToggle: {
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    typeButton: {
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
    },
    buttonContainer: {
        gap: Spacing.md,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.xl,
    },
    continueButton: {
        marginBottom: Spacing.xs,
    },
});
