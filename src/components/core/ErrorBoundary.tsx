/**
 * ErrorBoundary Component
 * 
 * Catches JavaScript errors in child component tree and displays fallback UI.
 * Logs errors via the logger utility.
 * 
 * Note: Uses Palette directly since class components can't use hooks.
 * This is intentional - the error boundary must work even when context fails.
 */

import { Palette, Shape, Spacing, Typography } from '@/src/constants';
import { analytics } from '@/src/services/analytics-service';
import { logger } from '@/src/utils/logger';
import React, { Component, ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
        analytics.logError(error, errorInfo.componentStack || undefined);
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
                    <Text style={[styles.emoji]}>😕</Text>
                    <Text style={[styles.title]}>Something went wrong</Text>
                    <Text style={[styles.message]}>
                        An unexpected error occurred. Please try again.
                    </Text>
                    {__DEV__ && this.state.error && (
                        <Text style={[styles.errorDetails]}>
                            {this.state.error.message}
                        </Text>
                    )}
                    <TouchableOpacity style={styles.button} onPress={this.handleReset}>
                        <Text style={[styles.buttonText]}>Try Again</Text>
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
        backgroundColor: Palette.background, // Use background token
    },
    emoji: {
        fontSize: Typography.sizes.hero,
        marginBottom: Spacing.lg,
        color: Palette.textPrimary, // Explicit color
    },
    title: {
        fontSize: Typography.sizes.xxl,
        fontFamily: Typography.fonts.heading,
        color: Palette.textPrimary,
        marginBottom: Spacing.sm,
        textAlign: 'center',
    },
    message: {
        fontSize: Typography.sizes.base,
        fontFamily: Typography.fonts.regular,
        color: Palette.textSecondary,
        textAlign: 'center',
        marginBottom: Spacing.xxl,
    },
    errorDetails: {
        fontSize: Typography.sizes.xs,
        fontFamily: Typography.fonts.regular,
        color: Palette.red,
        textAlign: 'center',
        marginBottom: Spacing.xxl,
        padding: Spacing.md,
        backgroundColor: Palette.surface,
        borderRadius: Shape.radius.sm,
        maxWidth: '100%',
    },
    button: {
        backgroundColor: Palette.mint,
        paddingHorizontal: Spacing.xxxl,
        paddingVertical: Spacing.md,
        borderRadius: Shape.radius.sm,
    },
    buttonText: {
        color: Palette.surface, // Dark text on mint
        fontSize: Typography.sizes.base,
        fontFamily: Typography.fonts.subheading,
    },
});
