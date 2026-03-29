import { AppSegmentedControl } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TabType } from '../hooks/useSimpleJournalEditor';

interface SimpleFormTabsProps {
    type: TabType;
    setType: (type: TabType) => void;
    activeColor: string;
}

export function SimpleFormTabs({ type, setType, activeColor }: SimpleFormTabsProps) {
    const { theme } = useTheme();

    return (
        <View style={styles.typeTabs}>
            <AppSegmentedControl
                options={[
                    { id: 'expense', label: 'Expense', icon: 'arrowDown' },
                    { id: 'income', label: 'Income', icon: 'arrowUp' },
                    { id: 'transfer', label: 'Transfer', icon: 'swapHorizontal' },
                ]}
                value={type}
                onChange={(next) => setType(next as TabType)}
                size="lg"
                flex
                trackColor={theme.surfaceSecondary}
                pillColor={theme.surface}
                activeTextColor={activeColor}
                inactiveTextColor={theme.textSecondary}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    typeTabs: {
        marginTop: Spacing.sm,
        marginBottom: Spacing.md,
    },
});
