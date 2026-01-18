import { Palette, Spacing } from '@/constants';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

interface FABProps {
    onPress: () => void;
    style?: ViewStyle;
}

export const FloatingActionButton = ({ onPress, style }: FABProps) => {
    return (
        <TouchableOpacity
            style={[styles.fab, style]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            <Ionicons name="add" size={32} color="#FFFFFF" />
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
        backgroundColor: Palette.ivy,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        zIndex: 100,
    },
});
