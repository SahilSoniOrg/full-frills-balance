import { AppButton, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import * as LocalAuthentication from '@/src/utils/auth';
import { Lock } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

export function AppLockInterceptor({ children }: { children: React.ReactNode }) {
    const { isAppLockEnabled, themeMode } = useUI();
    const [isUnlocked, setIsUnlocked] = useState(false);
    const appState = useRef(AppState.currentState);
    const isAuthenticating = useRef(false);
    const lastUnlockTime = useRef(0);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (
                appState.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                // Don't lock if we are currently showing the auth prompt or just did
                const justUnlocked = Date.now() - lastUnlockTime.current < 2000;

                if (isAppLockEnabled && !isAuthenticating.current && !justUnlocked) {
                    setIsUnlocked(false);
                }
            }
            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, [isAppLockEnabled]);

    // Trigger authentication on app start or when returning from background
    useEffect(() => {
        if (isAppLockEnabled && !isUnlocked) {
            handleUnlock();
        }
    }, [isAppLockEnabled]); // Removed isUnlocked from dependency array to prevent infinite loops

    const handleUnlock = async () => {
        // Prevent double prompting if already authenticated or authenticating
        if (isUnlocked || isAuthenticating.current) return;

        isAuthenticating.current = true;

        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();

            if (!hasHardware || !isEnrolled) {
                lastUnlockTime.current = Date.now();
                setIsUnlocked(true); // Failsafe: if somehow they enabled it without hardware
                return;
            }

            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock Full Frills Balance',
                fallbackLabel: 'Use Passcode',
                disableDeviceFallback: false,
            });
            if (result.success) {
                lastUnlockTime.current = Date.now();
                setIsUnlocked(true);
            }
        } catch (error) {
            // Ensure app isn't completely inaccessible on error
            console.error('AppLock authentication error:', error);
        } finally {
            // Small delay before resetting isAuthenticating to catch delayed app state changes
            setTimeout(() => {
                isAuthenticating.current = false;
            }, 500);
        }
    };

    if (isAppLockEnabled && !isUnlocked) {
        return (
            <Screen showBack={false} withPadding>
                <View style={styles.container}>
                    <View style={styles.iconContainer}>
                        <Lock size={64} color={themeMode === 'dark' ? '#fff' : '#000'} />
                    </View>
                    <AppText variant="title" weight="bold" style={styles.title}>
                        App Locked
                    </AppText>
                    <AppText variant="body" color="secondary" style={styles.subtitle}>
                        Authenticate to access your finances
                    </AppText>
                    <AppButton onPress={handleUnlock} variant="primary" size="lg">
                        Unlock
                    </AppButton>
                </View>
            </Screen>
        );
    }

    return <>{children}</>;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: Spacing.xl,
    },
    iconContainer: {
        marginBottom: Spacing.xl,
        padding: Spacing.xl,
        backgroundColor: 'rgba(128, 128, 128, 0.1)',
        borderRadius: 100,
    },
    title: {
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    subtitle: {
        marginBottom: Spacing.xxl,
        textAlign: 'center',
    },
});
