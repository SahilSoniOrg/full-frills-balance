import { AppButton } from '@/src/components/core/AppButton';
import { Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboard } from '@/src/design-system/Keyboard';

interface SubmitFooterProps {
    onPress: () => void;
    label: string;
    disabled: boolean;
    topSlot?: React.ReactNode;
}

export const SubmitFooter = ({
    onPress,
    label,
    disabled,
    topSlot,
}: SubmitFooterProps) => {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const { isKeyboardVisible } = useKeyboard();
    const bottomPadding = isKeyboardVisible 
        ? Spacing.md 
        : Math.max(Spacing.lg, insets.bottom + Spacing.md);

    return (
        <View
            style={[
                styles.footer,
                {
                    backgroundColor: theme.background,
                    borderTopColor: theme.border,
                    paddingBottom: bottomPadding,
                },
            ]}
        >
            {topSlot && <View style={styles.topSlot}>{topSlot}</View>}
            <AppButton
                variant="primary"
                onPress={onPress}
                disabled={disabled}
                style={styles.button}
                testID="submit-footer-button"
            >
                {label}
            </AppButton>
        </View>
    );
};

const styles = StyleSheet.create({
    footer: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
    },
    topSlot: {
        marginBottom: Spacing.md,
    },
    button: {
        height: Size.buttonXl,
        borderRadius: Shape.radius.r4,
    },
});
