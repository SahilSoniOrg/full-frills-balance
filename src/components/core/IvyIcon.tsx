import { AppText } from '@/src/components/core/AppText';
import { getContrastColor } from '@/src/constants/theme-helpers';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { AppIcon, IconName } from './AppIcon';

interface IvyIconProps {
    name?: IconName;
    label?: string;
    color: string;
    size?: number;
    style?: ViewStyle;
}

/**
 * IvyIcon - Circular icon container with contrast-aware content
 * Designed to provide a consistent visual identity for accounts and transaction types.
 */
export const IvyIcon = ({ name, label, color, size = 40, style }: IvyIconProps) => {
    const textColor = getContrastColor(color);
    const iconSize = size * 0.6;
    const labelSize = size * 0.5;

    return (
        <View style={[
            styles.container,
            {
                backgroundColor: color,
                width: size,
                height: size,
                borderRadius: size / 2
            },
            style
        ]}>
            {name ? (
                <AppIcon name={name} size={iconSize} color={textColor} />
            ) : label ? (
                <AppText
                    style={{
                        color: textColor,
                        fontSize: labelSize,
                        fontWeight: 'bold',
                        lineHeight: size // Center vertically
                    }}
                    align="center"
                >
                    {label.charAt(0).toUpperCase()}
                </AppText>
            ) : null}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
});
