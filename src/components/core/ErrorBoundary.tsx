/**
 * ErrorBoundary Component
 * 
 * Catches JavaScript errors in child component tree and displays fallback UI.
 * Logs errors via the logger utility.
 * 
 * Note: Uses Palette directly since class components can't use hooks.
 * This is intentional - the error boundary must work even when context fails.
 */

import { AppText } from '@/src/components/core/AppText';
import { Palette, Shape, Spacing, Typography } from '@/src/constants';
import { logger } from '@/src/utils/logger';
import React, { Component, ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        logger.error('Uncaught error in component tree', error, {
            componentStack: errorInfo.componentStack,
        });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <View style={styles.container}>
                    <AppText style={styles.emoji}>😕</AppText>
                    <AppText variant="heading" style={styles.title}>Something went wrong</AppText>
                    <AppText variant="body" style={styles.message}>
                        An unexpected error occurred. Please try again.
                    </AppText>
                    {__DEV__ && this.state.error && (
                        <AppText variant="caption" style={styles.errorDetails}>
                            {this.state.error.message}
                        </AppText>
                    )}
                    <TouchableOpacity style={styles.button} onPress={this.handleReset}>
                        <AppText variant="subheading" style={styles.buttonText}>Try Again</AppText>
                    </TouchableOpacity>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xxl,
        backgroundColor: Palette.trueBlack,
    },
    emoji: {
        fontSize: Typography.sizes.hero,
        marginBottom: Spacing.lg,
    },
    title: {
        fontSize: Typography.sizes.xxl,
        fontFamily: Typography.fonts.heading,
        color: Palette.white,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    message: {
        fontSize: Typography.sizes.base,
        color: Palette.gray,
        textAlign: 'center',
        marginBottom: Spacing.xxl,
    },
    errorDetails: {
        fontSize: Typography.sizes.xs,
        color: Palette.red,
        textAlign: 'center',
        marginBottom: Spacing.xxl,
        padding: Spacing.md,
        backgroundColor: Palette.extraDarkGray,
        borderRadius: Shape.radius.sm,
        maxWidth: '100%',
    },
    button: {
        backgroundColor: Palette.green,
        paddingHorizontal: Spacing.xxxl,
        paddingVertical: Spacing.md,
        borderRadius: Shape.radius.sm,
    },
    buttonText: {
        color: Palette.white,
        fontSize: Typography.sizes.base,
        fontFamily: Typography.fonts.subheading,
    },
});
