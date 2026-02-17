import { AppCard, AppText } from '@/src/components/core';
import { AppButton } from '@/src/components/core/AppButton';
import { Screen } from '@/src/components/layout';
import { AppConfig, FontIds, FontSchemes, Spacing, ThemeIds } from '@/src/constants';
import { useSettingsViewModel } from '@/src/features/settings/hooks/useSettingsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

export function AppearanceSettingsScreen() {
    const { theme } = useTheme();
    const vm = useSettingsViewModel();

    return (
        <Screen
            title="Appearance"
            showBack={true}
            scrollable
            withPadding
        >
            <View style={styles.container}>

                {/* THEME SECTION */}
                <AppText variant="subheading" style={styles.sectionTitle}>
                    {AppConfig.strings.settings.appearance.themeTitle}
                </AppText>
                <AppText variant="body" color="secondary" style={styles.sectionDesc}>
                    {AppConfig.strings.settings.appearance.themeDesc}
                </AppText>

                <View style={styles.optionsContainer}>
                    <Pressable onPress={() => vm.setThemeId(ThemeIds.DEEP_SPACE)}>
                        <AppCard
                            elevation={vm.themeId === ThemeIds.DEEP_SPACE ? 'sm' : 'none'}
                            style={[
                                styles.optionCard,
                                { borderWidth: vm.themeId === ThemeIds.DEEP_SPACE ? 2 : 1 },
                                { borderColor: vm.themeId === ThemeIds.DEEP_SPACE ? theme.primary : theme.border }
                            ]}
                        >
                            <View style={styles.optionContent}>
                                <View style={[styles.colorPreview, { backgroundColor: '#0F1A25' }]} />
                                <View style={{ flex: 1 }}>
                                    <AppText weight="bold">{AppConfig.strings.settings.appearance.deepSpace.label}</AppText>
                                    <AppText variant="caption" color="secondary">{AppConfig.strings.settings.appearance.deepSpace.desc}</AppText>
                                </View>
                                {vm.themeId === ThemeIds.DEEP_SPACE && <View style={[styles.radio, { borderColor: theme.primary, backgroundColor: theme.primary }]} />}
                                {vm.themeId !== ThemeIds.DEEP_SPACE && <View style={[styles.radio, { borderColor: theme.border }]} />}
                            </View>
                        </AppCard>
                    </Pressable>

                    <Pressable onPress={() => vm.setThemeId(ThemeIds.IVY)}>
                        <AppCard
                            elevation={vm.themeId === ThemeIds.IVY ? 'sm' : 'none'}
                            style={[
                                styles.optionCard,
                                { borderWidth: vm.themeId === ThemeIds.IVY ? 2 : 1 },
                                { borderColor: vm.themeId === ThemeIds.IVY ? theme.primary : theme.border }
                            ]}
                        >
                            <View style={styles.optionContent}>
                                <View style={[styles.colorPreview, { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ccc' }]} />
                                <View style={{ flex: 1 }}>
                                    <AppText weight="bold">{AppConfig.strings.settings.appearance.ivy.label}</AppText>
                                    <AppText variant="caption" color="secondary">{AppConfig.strings.settings.appearance.ivy.desc}</AppText>
                                </View>
                                {vm.themeId === ThemeIds.IVY && <View style={[styles.radio, { borderColor: theme.primary, backgroundColor: theme.primary }]} />}
                                {vm.themeId !== ThemeIds.IVY && <View style={[styles.radio, { borderColor: theme.border }]} />}
                            </View>
                        </AppCard>
                    </Pressable>
                </View>


                {/* TYPOGRAPHY SECTION */}
                <View style={styles.divider} />

                <AppText variant="subheading" style={styles.sectionTitle}>
                    {AppConfig.strings.settings.appearance.typographyTitle}
                </AppText>
                <AppText variant="body" color="secondary" style={styles.sectionDesc}>
                    {AppConfig.strings.settings.appearance.typographyDesc}
                </AppText>

                <View style={styles.optionsContainer}>
                    <Pressable onPress={() => vm.setFontId(FontIds.DEEP_SPACE)}>
                        <AppCard
                            elevation={vm.fontId === FontIds.DEEP_SPACE ? 'sm' : 'none'}
                            style={[
                                styles.optionCard,
                                { borderWidth: vm.fontId === FontIds.DEEP_SPACE ? 2 : 1 },
                                { borderColor: vm.fontId === FontIds.DEEP_SPACE ? theme.primary : theme.border }
                            ]}
                        >
                            <View style={styles.optionContent}>
                                <View style={{ flex: 1 }}>
                                    <AppText variant="heading" style={{ fontFamily: FontSchemes[FontIds.DEEP_SPACE].heading, marginBottom: 4 }}>
                                        {AppConfig.strings.settings.appearance.preview}
                                    </AppText>
                                    <AppText weight="bold">{AppConfig.strings.settings.appearance.serifSans.label}</AppText>
                                    <AppText variant="caption" color="secondary">{AppConfig.strings.settings.appearance.serifSans.desc}</AppText>
                                </View>
                                {vm.fontId === FontIds.DEEP_SPACE && <View style={[styles.radio, { borderColor: theme.primary, backgroundColor: theme.primary }]} />}
                                {vm.fontId !== FontIds.DEEP_SPACE && <View style={[styles.radio, { borderColor: theme.border }]} />}
                            </View>
                        </AppCard>
                    </Pressable>

                    <Pressable onPress={() => vm.setFontId(FontIds.IVY)}>
                        <AppCard
                            elevation={vm.fontId === FontIds.IVY ? 'sm' : 'none'}
                            style={[
                                styles.optionCard,
                                { borderWidth: vm.fontId === FontIds.IVY ? 2 : 1 },
                                { borderColor: vm.fontId === FontIds.IVY ? theme.primary : theme.border }
                            ]}
                        >
                            <View style={styles.optionContent}>
                                <View style={{ flex: 1 }}>
                                    <AppText variant="heading" style={{ fontFamily: FontSchemes[FontIds.IVY].heading, marginBottom: 4 }}>
                                        {AppConfig.strings.settings.appearance.preview}
                                    </AppText>
                                    <AppText weight="bold">{AppConfig.strings.settings.appearance.modernGeometric.label}</AppText>
                                    <AppText variant="caption" color="secondary">{AppConfig.strings.settings.appearance.modernGeometric.desc}</AppText>
                                </View>
                                {vm.fontId === FontIds.IVY && <View style={[styles.radio, { borderColor: theme.primary, backgroundColor: theme.primary }]} />}
                                {vm.fontId !== FontIds.IVY && <View style={[styles.radio, { borderColor: theme.border }]} />}
                            </View>
                        </AppCard>
                    </Pressable>
                </View>

                {/* MODE SECTION */}
                <View style={styles.divider} />

                <AppText variant="subheading" style={styles.sectionTitle}>
                    {AppConfig.strings.settings.appearance.modeTitle}
                </AppText>

                <View style={styles.modeRow}>
                    {(['system', 'light', 'dark'] as const).map((pref) => (
                        <AppButton
                            key={pref}
                            variant={vm.themePreference === pref ? 'primary' : 'outline'}
                            size="sm"
                            onPress={() => vm.setThemePreference(pref)}
                            style={{ flex: 1 }}
                        >
                            {pref.charAt(0).toUpperCase() + pref.slice(1)}
                        </AppButton>
                    ))}
                </View>

            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingBottom: Spacing.xl,
    },
    sectionTitle: {
        marginBottom: Spacing.xs,
        marginTop: Spacing.md,
    },
    sectionDesc: {
        marginBottom: Spacing.md,
    },
    optionsContainer: {
        gap: Spacing.md,
    },
    optionCard: {
        padding: Spacing.md,
    },
    optionContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    colorPreview: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    radio: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E5E5',
        marginVertical: Spacing.lg,
        opacity: 0.1,
    },
    modeRow: {
        flexDirection: 'row',
        gap: Spacing.sm,
        marginTop: Spacing.sm,
    }
});
