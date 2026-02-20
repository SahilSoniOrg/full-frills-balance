import { AppButton, AppIcon, AppText, Badge } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { SubAccountViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface SubAccountListModalProps {
    visible: boolean;
    onClose: () => void;
    parentName: string;
    subAccounts: SubAccountViewModel[];
    isLoading: boolean;
}

export function SubAccountListModal({
    visible,
    onClose,
    parentName,
    subAccounts,
    isLoading
}: SubAccountListModalProps) {
    const { theme } = useTheme();

    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 50,
                friction: 10
            }).start();
        } else {
            slideAnim.setValue(SCREEN_HEIGHT);
        }
    }, [visible, slideAnim]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Animated.View
                    style={[
                        styles.modalContent,
                        {
                            backgroundColor: theme.surface,
                            transform: [{ translateY: slideAnim }]
                        }
                    ]}
                >
                    <View style={styles.header}>
                        <View>
                            <AppText variant="subheading" weight="bold">
                                Sub-Accounts
                            </AppText>
                            <AppText variant="caption" color="secondary">
                                Details for &quot;{parentName}&quot;
                            </AppText>
                        </View>
                        <AppIcon name="hierarchy" size={Size.iconSm} color={theme.textTertiary} />
                    </View>

                    <ScrollView
                        style={styles.list}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {isLoading ? (
                            <View style={styles.emptyContainer}>
                                <AppText variant="body" color="secondary">Loading sub-accounts...</AppText>
                            </View>
                        ) : subAccounts.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <AppText variant="body" color="secondary">No sub-accounts found</AppText>
                            </View>
                        ) : (
                            subAccounts.map((account, index) => (
                                <View key={`${account.id}-${index}`} style={[styles.accountRow, { borderBottomColor: theme.divider }]}>
                                    {account.level > 0 && Array.from({ length: account.level }).map((_, i) => (
                                        <View key={i} style={[styles.indentation, {
                                            width: Spacing.lg,
                                            borderLeftWidth: 1,
                                            borderLeftColor: withOpacity(theme.textTertiary, 0.1),
                                            marginLeft: i === 0 ? 0 : 0
                                        }]} />
                                    ))}
                                    <View style={styles.accountLeft}>
                                        <View style={[styles.iconWrapper, { backgroundColor: withOpacity(account.color, Opacity.hover) }]}>
                                            <AppIcon name={account.icon as any} size={Size.iconSm} color={account.color} />
                                        </View>
                                        <AppText variant="body" weight="medium" style={styles.accountName} numberOfLines={1}>
                                            {account.name}
                                        </AppText>
                                        {account.isGroup && (
                                            <Badge
                                                variant="primary"
                                                size="sm"
                                                style={styles.badge}
                                                backgroundColor={withOpacity(account.color, Opacity.hover)}
                                                textColor={account.color}
                                            >
                                                Group
                                            </Badge>
                                        )}
                                    </View>
                                    <AppText variant="body" weight="bold">
                                        {account.balanceText}
                                    </AppText>
                                </View>
                            ))
                        )}
                    </ScrollView>

                    <View style={styles.footer}>
                        <AppButton
                            onPress={onClose}
                            variant="ghost"
                        >
                            Close
                        </AppButton>
                    </View>
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: Shape.radius.xl,
        borderTopRightRadius: Shape.radius.xl,
        maxHeight: '70%',
        paddingBottom: Spacing.xl,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.xl,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    },
    list: {
        paddingHorizontal: Spacing.xl,
    },
    listContent: {
        paddingVertical: Spacing.md,
    },
    accountRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    accountLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconWrapper: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.md,
    },
    accountName: {
        maxWidth: '50%',
        marginRight: Spacing.xs,
    },
    badge: {
        marginLeft: 0,
        alignSelf: 'center',
    },
    indentation: {
        height: 24,
        alignSelf: 'center',
    },
    emptyContainer: {
        padding: Spacing.xxl,
        alignItems: 'center',
    },
    footer: {
        paddingHorizontal: Spacing.xl,
        paddingTop: Spacing.md,
    }
});
