/**
 * HeaderActionGroup Component
 * 
 * Reusable component for detail screen header actions (edit, delete, recover).
 */
import { IconButton } from '@/src/components/core';
import { Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface HeaderActionGroupProps {
    /** Edit button handler */
    onEdit?: () => void;
    /** Delete button handler */
    onDelete?: () => void;
    /** Recover button handler (for deleted items) */
    onRecover?: () => void;
    /** Whether the item is in deleted state */
    isDeleted?: boolean;
}

export function HeaderActionGroup({
    onEdit,
    onDelete,
    onRecover,
    isDeleted = false,
}: HeaderActionGroupProps) {
    const { theme } = useTheme();

    return (
        <View style={styles.container}>
            {isDeleted ? (
                onRecover && (
                    <IconButton
                        name="refresh-outline"
                        onPress={onRecover}
                        variant="clear"
                        size={Typography.sizes.xl}
                        iconColor={theme.income}
                    />
                )
            ) : (
                <>
                    {onEdit && (
                        <IconButton
                            name="create-outline"
                            onPress={onEdit}
                            variant="clear"
                            size={Typography.sizes.xl}
                            iconColor={theme.text}
                        />
                    )}
                    {onDelete && (
                        <IconButton
                            name="trash-outline"
                            onPress={onDelete}
                            variant="clear"
                            size={Typography.sizes.xl}
                            iconColor={theme.error}
                        />
                    )}
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
});
