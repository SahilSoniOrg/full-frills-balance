import { IconButton } from '@/src/components/core';
import type { IconName } from '@/src/components/core';
import type { IconButtonVariant } from '@/src/components/core/IconButton';
import { Spacing } from '@/src/constants';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface ScreenHeaderActionItem {
    name: IconName;
    onPress?: () => void;
    variant?: IconButtonVariant;
    iconColor?: string;
    size?: number;
    testID?: string;
    disabled?: boolean;
}

interface ScreenHeaderActionsProps {
    actions: ScreenHeaderActionItem[];
}

export function ScreenHeaderActions({ actions }: ScreenHeaderActionsProps) {
    return (
        <View style={styles.container}>
            {actions.map((action, index) => (
                <IconButton
                    key={`${action.name}-${index}`}
                    name={action.name}
                    onPress={action.onPress}
                    variant={action.variant ?? 'clear'}
                    iconColor={action.iconColor}
                    size={action.size}
                    testID={action.testID}
                    disabled={action.disabled}
                />
            ))}
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
