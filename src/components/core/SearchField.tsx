import { AppIcon } from '@/src/components/core';
import { Shape, Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

interface SearchFieldProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
}

/**
 * SearchField - Ivy Wallet inspired search input
 * 
 * NOTE: This component intentionally uses raw TextInput rather than AppInput.
 * AppInput is designed for labeled form fields, while SearchField is a composite
 * widget with integrated search icon and clear button. This is documented as
 * an intentional design decision, not a violation of the design system.
 */
export const SearchField = ({ value, onChangeText, placeholder = "Search transactions..." }: SearchFieldProps) => {
    const { theme } = useTheme();

    return (
        <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <AppIcon name="search" size={Size.sm} color={theme.textSecondary} style={styles.icon} />
            <TextInput
                style={[styles.input, { color: theme.text }]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.textTertiary}
                selectionColor={theme.primary}
            />
            {value.length > 0 && (
                <TouchableOpacity onPress={() => onChangeText('')} style={styles.clearButton}>
                    <AppIcon name="closeCircle" size={Typography.sizes.lg} color={theme.textTertiary} />
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        height: Size.xxl,
        borderRadius: Shape.radius.r4, // Match Ivy 16px radius
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.md,
        borderWidth: 1,
    },
    icon: {
        marginRight: Spacing.sm,
    },
    input: {
        flex: 1,
        fontSize: Typography.sizes.base,
        height: '100%',
    },
    clearButton: {
        padding: Spacing.xs,
    },
});
