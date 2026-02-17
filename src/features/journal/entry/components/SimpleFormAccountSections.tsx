import { AppCard } from '@/src/components/core/AppCard';
import { Shape, Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { AccountTileList } from '@/src/features/journal/components/AccountTileList';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface SimpleFormAccountSectionsProps {
    sections: {
        title: string;
        accounts: Account[];
        selectedId: string;
        onSelect: (id: string) => void;
    }[];
    activeColor: string;
    frameBorderColor: string;
}

export function SimpleFormAccountSections({
    sections,
    activeColor,
    frameBorderColor,
}: SimpleFormAccountSectionsProps) {
    const { theme } = useTheme();

    return (
        <View style={styles.accountSectionStack}>
            {sections.map(section => (
                <AppCard
                    key={section.title}
                    elevation="none"
                    variant="default"
                    style={[styles.mainCard, { borderColor: frameBorderColor, backgroundColor: theme.surface }]}
                >
                    <AccountTileList
                        title={section.title}
                        accounts={section.accounts}
                        selectedId={section.selectedId}
                        onSelect={section.onSelect}
                        tintColor={activeColor}
                    />
                </AppCard>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    accountSectionStack: {
        gap: Spacing.sm,
        marginBottom: Spacing.md,
    },
    mainCard: {
        borderRadius: Shape.radius.r2,
        padding: Spacing.md,
        marginTop: 0,
        borderWidth: 1,
        borderColor: 'transparent',
    },
});
