import { AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';

export const IconPickerModal: React.FC<{
    visible: boolean;
    onClose: () => void;
    onSelect: (icon: IconName) => void;
    selectedIcon: IconName;
}> = ({ visible, onClose, onSelect, selectedIcon }) => {
    const { theme } = useTheme();
    const icons: IconName[] = [
        'tag', 'trendingUp', 'shoppingCart', 'coffee', 'bus', 'film',
        'shoppingBag', 'document', 'home', 'wallet', 'bank', 'safe', 'creditCard',
        'briefcase', 'circle', 'copy', 'receipt', 'calendar', 'search',
        'edit', 'delete', 'arrowUp', 'arrowDown', 'swapHorizontal'
    ];

    const { strings } = AppConfig;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <Pressable style={[styles.modalOverlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
                <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                    <AppText variant="subheading" style={styles.modalTitle}>{strings.onboarding.iconPickerTitle}</AppText>
                    <View style={styles.iconGrid}>
                        {icons.map((icon) => (
                            <TouchableOpacity
                                key={icon}
                                style={[
                                    styles.modalIconButton,
                                    { backgroundColor: selectedIcon === icon ? withOpacity(theme.primary, Opacity.soft) : 'transparent' }
                                ]}
                                onPress={() => {
                                    onSelect(icon);
                                    onClose();
                                }}
                            >
                                <AppIcon name={icon} size={Size.iconLg} color={selectedIcon === icon ? theme.primary : theme.text} />
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        borderRadius: Shape.radius.r3,
        padding: Spacing.lg,
        width: '80%',
        maxHeight: '60%',
    },
    modalTitle: {
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    iconGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    modalIconButton: {
        width: Size.xxl,
        height: Size.xxl,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: Shape.radius.r2,
    },
});
