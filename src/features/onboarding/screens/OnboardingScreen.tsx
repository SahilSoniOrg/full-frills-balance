import { AppButton, AppCard, AppIcon, AppInput, AppText } from '@/src/components/core';
import { Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext'; // Fixed relative import
import Currency from '@/src/data/models/Currency';
import { useImport } from '@/src/hooks/use-import';
import { useTheme } from '@/src/hooks/use-theme';
import { currencyInitService } from '@/src/services/currency-init-service';
import { logger } from '@/src/utils/logger';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function OnboardingScreen() {
    const [step, setStep] = useState(1)
    const [name, setName] = useState('')
    const [selectedCurrency, setSelectedCurrency] = useState('USD')
    const [currencies, setCurrencies] = useState<Currency[]>([])
    const [isCompleting, setIsCompleting] = useState(false)
    const { theme } = useTheme()
    const { completeOnboarding } = useUI()
    const { isImporting } = useImport()

    useEffect(() => {
        const loadCurrencies = async () => {
            // Ensure currencies are initialized
            await currencyInitService.initialize()
            const all = await currencyInitService.getAllCurrencies()
            setCurrencies(all)
        }
        loadCurrencies()
    }, [])

    const handleContinue = async () => {
        if (step === 1) {
            if (!name.trim()) return
            setStep(2)
            return
        }

        setIsCompleting(true)
        try {
            await completeOnboarding(name.trim(), selectedCurrency)
            router.replace('/account-creation' as any)
        } catch (error) {
            logger.error('Failed to complete onboarding:', error)
        } finally {
            setIsCompleting(false)
        }
    }

    const renderNameStep = () => (
        <>
            <AppText variant="title" style={styles.title}>
                Welcome to Balance
            </AppText>
            <AppText variant="body" color="secondary" style={styles.subtitle}>
                Let&apos;s start with your name to personalize your experience.
            </AppText>

            <AppCard elevation="sm" padding="lg" style={styles.inputContainer}>
                <AppInput
                    placeholder="Enter your name"
                    value={name}
                    onChangeText={setName}
                    autoFocus
                />
            </AppCard>

            <AppButton
                variant="primary"
                size="lg"
                onPress={handleContinue}
                disabled={!name.trim() || isCompleting}
                style={styles.continueButton}
            >
                Continue
            </AppButton>

            <View style={styles.divider}>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
                <AppText variant="caption" color="secondary" style={styles.orText}>OR</AppText>
                <View style={[styles.line, { backgroundColor: theme.border }]} />
            </View>

            <AppButton
                variant="outline"
                size="md"
                onPress={() => router.push('/import-selection')}
                loading={isImporting}
                disabled={isImporting || isCompleting}
            >
                Import Backup
            </AppButton>
        </>
    )

    const renderCurrencyStep = () => (
        <>
            <AppText variant="title" style={styles.title}>
                Default Currency
            </AppText>
            <AppText variant="body" color="secondary" style={styles.subtitle}>
                Choose the default currency for your accounts and transactions. You can change this later for individual accounts.
            </AppText>

            <AppCard elevation="sm" padding="none" style={styles.currencyListContainer}>
                <FlatList
                    data={currencies}
                    keyExtractor={(item) => item.code}
                    style={styles.currencyList}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[
                                styles.currencyItem,
                                { borderBottomColor: theme.border },
                                selectedCurrency === item.code && { backgroundColor: withOpacity(theme.primary, Opacity.soft / 2) }
                            ]}
                            onPress={() => setSelectedCurrency(item.code)}
                        >
                            <View style={styles.currencyInfo}>
                                <AppText variant="body">{item.name}</AppText>
                                <AppText variant="caption" color="secondary">{item.code}</AppText>
                            </View>
                            <View style={styles.currencyRight}>
                                <AppText variant="subheading">{item.symbol}</AppText>
                                {selectedCurrency === item.code && (
                                    <AppIcon name="checkCircle" size={Size.sm} color={theme.primary} style={{ marginLeft: Spacing.sm }} />
                                )}
                            </View>
                        </TouchableOpacity>
                    )}
                />
            </AppCard>

            <View style={styles.buttonContainer}>
                <AppButton
                    variant="primary"
                    size="lg"
                    onPress={handleContinue}
                    disabled={isCompleting}
                    style={styles.continueButton}
                >
                    {isCompleting ? 'Setting up...' : 'Get Started'}
                </AppButton>
                <AppButton
                    variant="outline"
                    size="lg"
                    onPress={() => setStep(1)}
                    disabled={isCompleting}
                >
                    Back
                </AppButton>
            </View>
        </>
    )

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.content}>
                {step === 1 ? renderNameStep() : renderCurrencyStep()}
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        padding: Spacing.lg,
    },
    content: {
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
    },
    title: {
        textAlign: 'center',
        marginBottom: Spacing.sm,
    },
    subtitle: {
        textAlign: 'center',
        marginBottom: Spacing.xl,
    },
    inputContainer: {
        marginBottom: Spacing.xl,
    },
    currencyListContainer: {
        height: Size.xxl * 6,
        marginBottom: Spacing.xl,
        overflow: 'hidden',
    },
    currencyList: {
        flex: 1,
    },
    currencyItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.lg,
        borderBottomWidth: 1,
    },
    currencyInfo: {
        flex: 1,
    },
    currencyRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    buttonContainer: {
        gap: Spacing.md,
    },
    continueButton: {
        marginBottom: Spacing.xs,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: Spacing.lg,
    },
    line: {
        flex: 1,
        height: 1,
    },
    orText: {
        marginHorizontal: Spacing.md,
    },
});
