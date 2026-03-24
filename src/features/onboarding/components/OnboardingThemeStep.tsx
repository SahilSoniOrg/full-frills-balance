import { AppButton, AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, FontId, FontIds, FontSchemes, Spacing, ThemeId, ThemeIds } from '@/src/constants';
import { useUI } from '@/src/contexts/UIContext';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { triggerHaptic } from '@/src/utils/haptics';
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, PanResponder, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { MotiView } from 'moti';
import { SafeToSpendCard } from '@/src/features/dashboard/components/SafeToSpendCard';

type OnboardingThemeStepProps = {
    onContinue: () => void;
    onBack: () => void;
    isCompleting: boolean;
};

const MOCK_SAFE_TO_SPEND_PROPS: any = {
    safeToSpend: 2400,
    shortfall: 0,
    projection: undefined,
    committedBudget: 600,
    committedPlanned: 200,
    committedLiabilities: 100,
    committedLiabilitiesCC: 50,
    committedLiabilitiesOther: 50,
    totalFutureInflow: 3000,
    totalLiquidAssets: 4000,
    totalLiabilities: 1000,
    currencyCode: AppConfig.defaultCurrency,
    liquidAssetSubtypes: [],
    liquidAssetAccounts: [],
    committedBreakdown: [
        {
            accountId: 'mock1',
            accountName: 'Groceries',
            amount: 150,
            details: [{ id: 'mock1-detail', name: 'Whole Foods Target', amount: 150, type: 'BUDGET', dayOffset: 10 }]
        }
    ],
    debtBreakdown: [],
    incomeBreakdown: [
        { id: 'mock2', name: 'Salary', amount: 3000, dayOffset: 15, type: 'PLANNED_PAYMENT' }
    ],
    firstMajorInflowDay: 15,
    isLoading: false,
};

export function OnboardingThemeStep(props: OnboardingThemeStepProps) {
    const { theme } = useTheme();
    const ui = useUI();

    const handleSelectTheme = (themeId: ThemeId) => {
        void triggerHaptic('light');
        ui.setThemeId(themeId);
    };

    const handleSelectFont = (fontId: FontId) => {
        void triggerHaptic('light');
        ui.setFontId(fontId);
    };

    const strings = AppConfig.strings.onboarding.appearance;
    const settingsStrings = AppConfig.strings.settings.appearance;

    const THEME_ORDER = [ThemeIds.DEEP_SPACE, ThemeIds.IVY, ThemeIds.EDITORIAL];

    const themeIdRef = useRef(ui.themeId);
    themeIdRef.current = ui.themeId;
    const [slideDirection, setSlideDirection] = useState<number>(1);

    const cycleTheme = (direction: number) => {
        const currentIndex = THEME_ORDER.indexOf(themeIdRef.current as any);
        if (currentIndex === -1) return;
        
        let nextIndex = currentIndex + direction;
        if (nextIndex >= THEME_ORDER.length) nextIndex = 0;
        if (nextIndex < 0) nextIndex = THEME_ORDER.length - 1;
        
        triggerHaptic('light');
        setSlideDirection(direction);
        handleSelectTheme(THEME_ORDER[nextIndex]);
    };

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
                // Only capture horizontal swipes
                return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
            },
            onPanResponderRelease: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
                if (gestureState.dx > 50) {
                    // Swipe right -> previous theme
                    cycleTheme(-1);
                } else if (gestureState.dx < -50) {
                    // Swipe left -> next theme
                    cycleTheme(1);
                }
            },
        })
    ).current;

    const styles = StyleSheet.create({
        optionsContainer: {
            flexDirection: 'row',
            gap: Spacing.sm,
            marginBottom: Spacing.xl,
        },
    });

    const THEME_LABELS: Record<ThemeId, string> = {
        [ThemeIds.DEEP_SPACE]: settingsStrings.deepSpace.label,
        [ThemeIds.IVY]: settingsStrings.ivy.label,
        [ThemeIds.EDITORIAL]: settingsStrings.editorial.label,
    };

    const getThemeLabel = (offset: number) => {
        const currentIndex = THEME_ORDER.indexOf(ui.themeId as any);
        if (currentIndex === -1) return '';
        let targetIndex = currentIndex + offset;
        if (targetIndex >= THEME_ORDER.length) targetIndex = 0;
        if (targetIndex < 0) targetIndex = THEME_ORDER.length - 1;
        return THEME_LABELS[THEME_ORDER[targetIndex] as ThemeId];
    };


    const renderFontOption = (
        id: FontId,
        label: string,
    ) => {
        const isSelected = ui.fontId === id;
        return (
            <Pressable style={{ flex: 1 }} onPress={() => handleSelectFont(id)}>
                <AppCard
                    elevation={isSelected ? 'sm' : 'none'}
                    style={[
                        { padding: Spacing.md, borderRadius: 16, alignItems: 'center', gap: Spacing.sm },
                        { borderWidth: isSelected ? 2 : 1 },
                        { borderColor: isSelected ? theme.primary : theme.border }
                    ]}
                >
                    <AppText variant="heading" style={{ fontFamily: FontSchemes[id].heading, fontSize: 24, lineHeight: 28 }}>
                        Aa
                    </AppText>
                    <AppText variant="caption" weight={isSelected ? "bold" : "regular"} style={{ textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
                        {label}
                    </AppText>
                </AppCard>
            </Pressable>
        );
    };

    return (
        <Box flex={1}>
            <View style={{ paddingHorizontal: 4, paddingBottom: 16 }}>
                <AppText variant="hero" weight="bold" style={{ fontSize: 28, marginBottom: 8 }}>
                    {strings.title}
                </AppText>
                <AppText variant="body" color="secondary">
                    {strings.subtitle}
                </AppText>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 100 }}
            >
                {/* PREVIEW */}
                <AppText variant="title" weight="bold" style={{ marginBottom: 16 }}>
                    {strings.previewLabel}
                </AppText>
                <View {...panResponder.panHandlers}>
                    <View pointerEvents="none">
                        <SafeToSpendCard {...MOCK_SAFE_TO_SPEND_PROPS} />
                    </View>
                </View>
                
                {/* Theme Selector Ribbon */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md, marginBottom: Spacing.xxl }}>
                    <Pressable onPress={() => cycleTheme(-1)} hitSlop={20} style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 4 }}>
                        <AppIcon name="chevronLeft" size={20} color={theme.textSecondary} />
                        <MotiView
                            key={`prev-${ui.themeId}`}
                            from={{ opacity: 0, translateX: slideDirection * 10 }}
                            animate={{ opacity: 1, translateX: 0 }}
                            transition={{ type: 'timing', duration: 250 }}
                        >
                            <AppText variant="caption" color="secondary" numberOfLines={1}>{getThemeLabel(-1)}</AppText>
                        </MotiView>
                    </Pressable>
                    
                    <View style={{ flex: 1, alignItems: 'center', overflow: 'hidden' }}>
                         <MotiView
                            key={`curr-${ui.themeId}`}
                            from={{ opacity: 0, translateX: slideDirection * 20 }}
                            animate={{ opacity: 1, translateX: 0 }}
                            transition={{ type: 'timing', duration: 250 }}
                         >
                             <AppText weight="bold" numberOfLines={1}>{getThemeLabel(0)}</AppText>
                         </MotiView>
                    </View>

                    <Pressable onPress={() => cycleTheme(1)} hitSlop={20} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flex: 1, gap: 4 }}>
                        <MotiView
                            key={`next-${ui.themeId}`}
                            from={{ opacity: 0, translateX: slideDirection * 10 }}
                            animate={{ opacity: 1, translateX: 0 }}
                            transition={{ type: 'timing', duration: 250 }}
                        >
                            <AppText variant="caption" color="secondary" numberOfLines={1}>{getThemeLabel(1)}</AppText>
                        </MotiView>
                        <AppIcon name="chevronRight" size={20} color={theme.textSecondary} />
                    </Pressable>
                </View>

                <AppText variant="title" weight="bold" style={{ marginBottom: 16 }}>
                    {strings.fontTitle}
                </AppText>
                <View style={styles.optionsContainer}>
                    {renderFontOption(FontIds.DEEP_SPACE, settingsStrings.serifSans.label)}
                    {renderFontOption(FontIds.IVY, settingsStrings.modernGeometric.label)}
                    {renderFontOption(FontIds.EDITORIAL, settingsStrings.classicSerif.label)}
                </View>

                <View style={{ height: Spacing.xxxl }} />
            </ScrollView>

            {/* Sticky Actions */}
            <Stack paddingBottom={0} space="sm" style={{ marginTop: 'auto', paddingTop: Spacing.md }}>
                <AppButton
                    variant="primary"
                    size="lg"
                    onPress={props.onContinue}
                    disabled={props.isCompleting}
                    style={{ width: '100%' }}
                >
                    Continue
                </AppButton>
                <AppButton
                    variant="ghost"
                    size="md"
                    onPress={props.onBack}
                    disabled={props.isCompleting}
                >
                    Back
                </AppButton>
            </Stack>
        </Box>
    );
}
