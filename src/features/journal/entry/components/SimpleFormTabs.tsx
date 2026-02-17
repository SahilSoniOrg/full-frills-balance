import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { TabType } from '../hooks/useSimpleJournalEditor';

interface SimpleFormTabsProps {
    type: TabType;
    setType: (type: TabType) => void;
    activeColor: string;
    frameBorderColor: string;
}

export function SimpleFormTabs({ type, setType, activeColor, frameBorderColor }: SimpleFormTabsProps) {
    const { theme } = useTheme();

    const typeMeta: Record<TabType, { label: string; icon: 'arrowDown' | 'arrowUp' | 'swapHorizontal' }> = {
        expense: { label: 'Expense', icon: 'arrowDown' },
        income: { label: 'Income', icon: 'arrowUp' },
        transfer: { label: 'Transfer', icon: 'swapHorizontal' },
    };

    return (
        <View style={[styles.typeTabs, { backgroundColor: theme.surfaceSecondary, borderColor: frameBorderColor }]}>
            {(['expense', 'income', 'transfer'] as const).map(t => (
                <TouchableOpacity
                    key={t}
                    testID={`tab-${t}`}
                    style={[
                        styles.typeTab,
                        type === t && { backgroundColor: theme.surface }
                    ]}
                    onPress={() => setType(t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: type === t }}
                >
                    <View style={styles.typeTabContent}>
                        <AppIcon name={typeMeta[t].icon} size={Size.iconXs} color={type === t ? activeColor : theme.textSecondary} />
                        <AppText
                            variant="caption"
                            weight="bold"
                            style={{ color: type === t ? activeColor : theme.textSecondary }}
                        >
                            {typeMeta[t].label.toUpperCase()}
                        </AppText>
                    </View>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    typeTabs: {
        flexDirection: 'row',
        padding: Spacing.xs,
        borderRadius: Shape.radius.full,
        marginTop: Spacing.sm,
        marginBottom: Spacing.md,
        borderWidth: 1,
        overflow: 'hidden',
    },
    typeTab: {
        flex: 1,
        paddingVertical: Spacing.md,
        alignItems: 'center',
        borderRadius: Shape.radius.full, // Shape.radius.full equivalent
    },
    typeTabContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
});
