import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { AppIcon } from './AppIcon';

interface FABProps {
    onPress: () => void;
    style?: ViewStyle;
}

export const FloatingActionButton = ({ onPress, style }: FABProps) => {
    const { theme } = useTheme();

    return (
        <TouchableOpacity
            style={[
                styles.fab,
                {
                    backgroundColor: theme.primary,
                },
                style
            ]}
            onPress={onPress}
            activeOpacity={Opacity.heavy}
            testID="fab-button"
        >
            <AppIcon name="add" size={Size.buttonSm} color={theme.pureInverse} />
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        right: Spacing.xl,
        bottom: Spacing.xl,
        width: Size.fab,
        height: Size.fab,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        // @ts-ignore
        boxShadow: Shape.elevation.lg.boxShadow,
        elevation: Shape.elevation.lg.elevation,
        zIndex: 100,
    },
});
