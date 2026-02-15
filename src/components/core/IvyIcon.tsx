import { AppIcon, IconName, isValidIconName } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { getContrastColor } from '@/src/constants/theme-helpers';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

interface IvyIconProps {
    name?: string | IconName;
    label?: string;
    color: string;
    size?: number;
    style?: ViewStyle;
    iconColor?: string;
    shape?: 'circle' | 'square';
}

/**
 * IvyIcon - Circular icon container with contrast-aware content
 * Designed to provide a consistent visual identity for accounts and transaction types.
 */
export const IvyIcon = ({ name, label, color, size = 40, style, iconColor, shape = 'circle' }: IvyIconProps) => {
    const textColor = iconColor || getContrastColor(color);
    const iconSize = size * 0.6;
    const labelSize = size * 0.5;

    const hasValidIcon = name && isValidIconName(name as string);

    return (
        <View style={[
            styles.container,
            {
                backgroundColor: color,
                width: size,
                height: size,
                borderRadius: shape === 'circle' ? size / 2 : 8
            },
            style
        ]}>
            {hasValidIcon ? (
                <AppIcon name={name as IconName} size={iconSize} color={textColor} />
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
