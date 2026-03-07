import { useTheme } from '@/src/hooks/use-theme';
import React, { useEffect, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, KeyboardAvoidingViewProps, Platform, ScrollView, ScrollViewProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';

export interface FormScreenWrapperProps {
    children: React.ReactNode;
    footerSlot?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    contentContainerStyle?: StyleProp<ViewStyle>;
    scrollProps?: Omit<ScrollViewProps, 'style' | 'contentContainerStyle' | 'showsVerticalScrollIndicator'>;
}

export function useBehavior() {
    const defaultValue: KeyboardAvoidingViewProps['behavior'] = Platform.OS === 'ios' ? 'padding' : 'height'

    const [behaviour, setBehaviour] = useState<KeyboardAvoidingViewProps['behavior']>(defaultValue)

    useEffect(() => {
        const showListener = Keyboard.addListener('keyboardDidShow', () => {
            setBehaviour(defaultValue)
        })
        const hideListener = Keyboard.addListener('keyboardDidHide', () => {
            setBehaviour(undefined)
        })

        return () => {
            showListener.remove()
            hideListener.remove()
        }
    }, [])

    return behaviour
}

export const FormScreenWrapper: React.FC<FormScreenWrapperProps> = ({
    children,
    footerSlot,
    style,
    contentContainerStyle,
    scrollProps
}) => {
    const { theme } = useTheme();
    const behaviour = useBehavior()

    return (
        <KeyboardAvoidingView
            behavior={behaviour}
            style={[{ flex: 1, backgroundColor: theme.background }, style]}
        >
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
                showsVerticalScrollIndicator={false}
                {...scrollProps}
            >
                {children}
            </ScrollView>

            {footerSlot}
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
});
