import { AppButton, AppText } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ModalSurface } from './ModalSurface';

type ConfirmDialogAction = {
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
};

interface ConfirmDialogProps {
    visible: boolean;
    title: string;
    onClose: () => void;
    message?: React.ReactNode;
    children?: React.ReactNode;
    primaryAction: ConfirmDialogAction;
    secondaryAction?: ConfirmDialogAction;
    accessibilityCloseLabel?: string;
}

export function ConfirmDialog({
    visible,
    title,
    onClose,
    message,
    children,
    primaryAction,
    secondaryAction,
    accessibilityCloseLabel,
}: ConfirmDialogProps) {
    return (
        <ModalSurface
            visible={visible}
            title={title}
            onClose={onClose}
            accessibilityCloseLabel={accessibilityCloseLabel}
            fixedHeight={false}
            scrollable={false}
            footer={
                <View style={styles.footer}>
                    {secondaryAction ? (
                        <AppButton
                            variant={secondaryAction.variant || 'outline'}
                            onPress={secondaryAction.onPress}
                            style={styles.actionButton}
                        >
                            {secondaryAction.label}
                        </AppButton>
                    ) : null}
                    <AppButton
                        variant={primaryAction.variant || 'primary'}
                        onPress={primaryAction.onPress}
                        style={styles.actionButton}
                    >
                        {primaryAction.label}
                    </AppButton>
                </View>
            }
        >
            {typeof message === 'string' ? <AppText>{message}</AppText> : message}
            {children}
        </ModalSurface>
    );
}

const styles = StyleSheet.create({
    footer: {
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: 'transparent',
        flexDirection: 'row',
        gap: Spacing.sm,
    },
    actionButton: {
        flex: 1,
        borderRadius: Shape.radius.full,
    },
});
