import { Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

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
                    shadowColor: '#000', // Physical shadow is always dark
                },
                style
            ]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            <Ionicons name="add" size={32} color={theme.pureInverse} />
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    fab: {
        position: 'absolute',
        right: Spacing.xl,
        bottom: Spacing.xl,
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        zIndex: 100,
    },
});
