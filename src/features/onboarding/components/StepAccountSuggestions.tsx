import { AppButton, AppIcon, AppInput, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { DEFAULT_ACCOUNTS } from '../constants';
import { IconPickerModal } from './IconPickerModal';

interface StepAccountSuggestionsProps {
    selectedAccounts: string[];
    customAccounts: { name: string; icon: IconName }[];
    onToggleAccount: (name: string) => void;
    onAddCustomAccount: (name: string, icon: IconName) => void;
    onContinue: () => void;
    onBack: () => void;
    isCompleting: boolean;
}

export const StepAccountSuggestions: React.FC<StepAccountSuggestionsProps> = ({
    selectedAccounts,
    customAccounts,
    onToggleAccount,
    onAddCustomAccount,
    onContinue,
    onBack,
    isCompleting,
}) => {
    const { theme } = useTheme();
    const [customName, setCustomName] = useState('');
    const [selectedIcon, setSelectedIcon] = useState<IconName>('wallet');
    const [isIconPickerVisible, setIsIconPickerVisible] = useState(false);

    const handleAddCustom = () => {
        if (!customName.trim()) return;
        onAddCustomAccount(customName.trim(), selectedIcon);
        setCustomName('');
        setSelectedIcon('wallet');
    };

    const allSuggestions = [
        ...DEFAULT_ACCOUNTS,
        ...customAccounts.map(acc => ({ name: acc.name, icon: acc.icon, isCustom: true }))
    ];

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
            <AppText variant="title" style={styles.title}>
                Initial Accounts
            </AppText>
            <AppText variant="body" color="secondary" style={styles.subtitle}>
                Select starting accounts or add your own.
            </AppText>

            <ScrollView
                style={styles.scrollContainer}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.grid}>
                    {allSuggestions.map((account) => {
                        const isSelected = selectedAccounts.includes(account.name);
                        return (
                            <TouchableOpacity
                                key={account.name}
                                style={[
                                    styles.suggestionItem,
                                    {
                                        backgroundColor: isSelected ? theme.primary + '20' : theme.surface,
                                        borderColor: isSelected ? theme.primary : theme.border,
                                    }
                                ]}
                                onPress={() => onToggleAccount(account.name)}
                                accessibilityLabel={`${account.name} account, ${isSelected ? 'selected' : 'not selected'}`}
                                accessibilityRole="button"
                                accessibilityState={{ selected: isSelected }}
                            >
                                <AppIcon
                                    name={account.icon}
                                    size={Size.sm}
                                    color={isSelected ? theme.primary : theme.textSecondary}
                                />
                                <AppText
                                    variant="caption"
                                    numberOfLines={1}
                                    style={[
                                        styles.itemText,
                                        { color: isSelected ? theme.primary : theme.text }
                                    ]}
                                >
                                    {account.name}
                                </AppText>
                                {isSelected && (
                                    <View style={[styles.checkBadge, { backgroundColor: theme.success }]}>
                                        <AppIcon name="checkCircle" size={12} color={theme.surface} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={styles.customInputContainer}>
                    <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                        onPress={() => setIsIconPickerVisible(true)}
                        accessibilityLabel="Select icon for custom account"
                        accessibilityRole="button"
                    >
                        <AppIcon name={selectedIcon} size={Size.sm} color={theme.primary} />
                    </TouchableOpacity>

                    <AppInput
                        placeholder="Add custom account..."
                        value={customName}
                        onChangeText={setCustomName}
                        containerStyle={styles.customInput}
                        accessibilityLabel="Custom account name input"
                    />

                    <TouchableOpacity
                        style={[styles.addButton, { backgroundColor: theme.primary }]}
                        onPress={handleAddCustom}
                        accessibilityLabel="Add custom account"
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !customName.trim() }}
                    >
                        <AppIcon name="add" size={Size.sm} color={theme.surface} />
                    </TouchableOpacity>
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
                    variant="outline"
                    size="md"
                    onPress={onContinue}
                    disabled={isCompleting}
                    style={styles.continueButton}
                >
                    Continue
                </AppButton>
                <AppButton
                    variant="ghost"
                    size="md"
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
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.md,
        justifyContent: 'flex-start',
        overflow: 'visible',
    },
    suggestionItem: {
        width: '30%',
        aspectRatio: 1,
        borderRadius: Shape.radius.r3,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.sm,
        position: 'relative',
        marginBottom: Spacing.xs,
        overflow: 'visible',
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
        borderRadius: 10,
        padding: 2,
    },
    customInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: Spacing.lg,
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
    buttonContainer: {
        gap: Spacing.md,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.xl,
    },
    continueButton: {
        marginBottom: Spacing.xs,
    },
});
