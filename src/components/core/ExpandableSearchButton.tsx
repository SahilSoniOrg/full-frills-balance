import { AppIcon } from '@/src/components/core/AppIcon';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import {
    Platform,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';
import { useExpandableSearch } from './hooks/useExpandableSearch';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ExpandableSearchButtonProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    onExpandChange?: (isExpanded: boolean) => void;
}

/**
 * ExpandableSearchButton - A search icon that expands to a full search field on tap
 * 
 * Collapsed: Shows only the search icon
 * Expanded: Shows full search input with clear button
 */
export const ExpandableSearchButton = ({
    value,
    onChangeText,
    placeholder = "Search...",
    onExpandChange,
}: ExpandableSearchButtonProps) => {
    const { theme } = useTheme();
    const {
        isExpanded,
        handleExpand,
        handleCollapse,
        handleClear,
        inputRef
    } = useExpandableSearch({ value, onChangeText, onExpandChange });

    if (!isExpanded) {
        return (
            <TouchableOpacity
                onPress={handleExpand}
                style={[styles.iconButton, { backgroundColor: theme.surface }]}
                activeOpacity={Opacity.heavy}
            >
                <AppIcon name="search" size={Size.sm} color={theme.textSecondary} />
            </TouchableOpacity>
        );
    }

    return (
        <View
            style={[
                styles.expandedContainer,
                {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                }
            ]}
        >
            <AppIcon name="search" size={Size.sm} color={theme.textSecondary} style={styles.icon} />
            <TextInput
                ref={inputRef}
                style={[styles.input, { color: theme.text }]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.textTertiary}
                selectionColor={theme.primary}
                autoFocus
            />
            {value.length > 0 ? (
                <TouchableOpacity onPress={handleClear} style={styles.clearButton}>
                    <AppIcon name="closeCircle" size={Typography.sizes.lg} color={theme.textTertiary} />
                </TouchableOpacity>
            ) : (
                <TouchableOpacity onPress={handleCollapse} style={styles.clearButton}>
                    <AppIcon name="close" size={Size.sm} color={theme.textSecondary} />
                </TouchableOpacity>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    iconButton: {
        width: Size.xxl,
        height: Size.xxl,
        borderRadius: Shape.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    expandedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        height: Size.xxl,
        minHeight: Size.xxl,
        borderRadius: Shape.radius.md,
        paddingHorizontal: Spacing.md,
    },
    icon: {
        marginRight: Spacing.md,
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
