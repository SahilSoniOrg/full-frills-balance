import { FormScreenWrapper } from '@/src/components/common/FormScreenWrapper';
import { Screen } from '@/src/components/layout';
import React from 'react';
import { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { Edge } from 'react-native-safe-area-context';

type FormScreenScaffoldProps = {
    title: string;
    showBack?: boolean;
    edges?: Edge[];
    headerActions?: React.ReactNode;
    footerSlot?: React.ReactNode;
    contentContainerStyle?: StyleProp<ViewStyle>;
    scrollProps?: Omit<ScrollViewProps, 'style' | 'contentContainerStyle' | 'showsVerticalScrollIndicator'>;
    children: React.ReactNode;
};

export function FormScreenScaffold({
    title,
    showBack = true,
    edges,
    headerActions,
    footerSlot,
    contentContainerStyle,
    scrollProps,
    children,
}: FormScreenScaffoldProps) {
    return (
        <Screen
            title={title}
            showBack={showBack}
            edges={edges}
            headerActions={headerActions}
        >
            <FormScreenWrapper
                footerSlot={footerSlot}
                contentContainerStyle={contentContainerStyle}
                scrollProps={scrollProps}
            >
                {children}
            </FormScreenWrapper>
        </Screen>
    );
}
