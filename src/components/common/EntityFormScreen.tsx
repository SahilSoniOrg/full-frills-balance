import { SubmitFooter } from '@/src/components/common/SubmitFooter';
import { AppButton } from '@/src/components/core';
import { Shape, Spacing } from '@/src/constants';
import React from 'react';
import { ScrollViewProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Edge } from 'react-native-safe-area-context';
import { FormScreenScaffold } from './FormScreenScaffold';

type SubmitAction = {
    label: string;
    onPress: () => void;
    disabled: boolean;
    topSlot?: React.ReactNode;
};

type SecondaryAction = {
    label: string;
    onPress: () => void;
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
    disabled?: boolean;
};

type EntityFormScreenProps = {
    title: string;
    showBack?: boolean;
    onBack?: () => void;
    edges?: Edge[];
    headerActions?: React.ReactNode;
    contentContainerStyle?: StyleProp<ViewStyle>;
    scrollProps?: Omit<ScrollViewProps, 'style' | 'contentContainerStyle' | 'showsVerticalScrollIndicator'>;
    intro?: React.ReactNode;
    submitAction: SubmitAction;
    secondaryAction?: SecondaryAction;
    children: React.ReactNode;
};

export function EntityFormScreen({
    title,
    showBack = true,
    onBack,
    edges,
    headerActions,
    contentContainerStyle,
    scrollProps,
    intro,
    submitAction,
    secondaryAction,
    children,
}: EntityFormScreenProps) {
    return (
        <FormScreenScaffold
            title={title}
            showBack={showBack}
            onBack={onBack}
            edges={edges}
            headerActions={headerActions}
            contentContainerStyle={contentContainerStyle}
            scrollProps={scrollProps}
            footerSlot={
                <View style={styles.footerStack}>
                    <SubmitFooter
                        onPress={submitAction.onPress}
                        label={submitAction.label}
                        disabled={submitAction.disabled}
                        topSlot={submitAction.topSlot}
                    />
                    {secondaryAction ? (
                        <View style={styles.secondaryActionContainer}>
                            <AppButton
                                variant={secondaryAction.variant || 'outline'}
                                onPress={secondaryAction.onPress}
                                disabled={secondaryAction.disabled}
                                style={styles.secondaryActionButton}
                            >
                                {secondaryAction.label}
                            </AppButton>
                        </View>
                    ) : null}
                </View>
            }
        >
            {intro}
            {children}
        </FormScreenScaffold>
    );
}

const styles = StyleSheet.create({
    footerStack: {
        backgroundColor: 'transparent',
    },
    secondaryActionContainer: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.lg,
    },
    secondaryActionButton: {
        width: '100%',
        borderRadius: Shape.radius.full,
    },
});
