import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { insightService, Pattern } from '@/src/services/insight-service';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';

interface InsightWidgetProps {
    patterns: Pattern[];
}

export const InsightWidget = ({ patterns }: InsightWidgetProps) => {
    const { theme, fonts } = useTheme();
    const { width: screenWidth } = useWindowDimensions();
    const router = useRouter();

    const handleDismiss = async (id: string) => {
        await insightService.dismissPattern(id);
    };

    const handlePress = (pattern: Pattern) => {
        router.push({
            pathname: '/insight-details',
            params: {
                id: pattern.id,
                message: pattern.message,
                suggestion: pattern.suggestion,
                journalIds: pattern.journalIds.join(','),
                severity: pattern.severity
            }
        });
    };

    if (patterns.length === 0) return null;

    return (
        <View style={styles.container}>
            <AppText variant="subheading" color="secondary" style={styles.title}>
                {AppConfig.strings.dashboard.insightsTitle}
            </AppText>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                snapToAlignment="center"
                decelerationRate="fast"
                snapToInterval={screenWidth * 0.85 + Spacing.sm}
            >
                {patterns.map(pattern => (
                    <AppCard
                        key={pattern.id}
                        elevation="sm"
                        padding="none" // Padding moved to internal container for better touch feedback
                        style={[
                            styles.card,
                            {
                                width: screenWidth * 0.85,
                                borderLeftWidth: 4,
                                borderLeftColor: theme[pattern.severity === 'high' ? 'error' : pattern.severity === 'medium' ? 'warning' : 'primary']
                            }
                        ]}
                    >
                        <Pressable
                            onPress={() => handlePress(pattern)}
                            style={styles.cardPressable}
                            android_ripple={{ color: withOpacity(theme.primary, Opacity.soft) }}
                        >
                            <View style={styles.header}>
                                <View style={styles.iconTitle}>
                                    <AppIcon
                                        name={pattern.type === 'subscription-amnesiac' ? 'repeat' : 'trendingUp'}
                                        size={Size.xs}
                                        color={theme.text}
                                    />
                                    <AppText variant="body" style={{ fontFamily: fonts.bold }}>
                                        {pattern.message}
                                    </AppText>
                                </View>
                                <TouchableOpacity
                                    onPress={(e) => {
                                        e.stopPropagation();
                                        handleDismiss(pattern.id);
                                    }}
                                    style={styles.dismissBtn}
                                >
                                    <AppIcon name="close" size={16} color={theme.textSecondary} />
                                </TouchableOpacity>
                            </View>
                            <AppText variant="caption" color="secondary" style={styles.description} numberOfLines={2}>
                                {pattern.description}
                            </AppText>
                            <View style={[styles.suggestion, { backgroundColor: withOpacity(theme.primary, Opacity.soft) }]}>
                                <AppText variant="caption" style={{ color: theme.primary, fontFamily: fonts.medium }} numberOfLines={1}>
                                    💡 {pattern.suggestion}
                                </AppText>
                            </View>
                        </Pressable>
                    </AppCard>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.xl,
    },
    title: {
        marginBottom: Spacing.md,
    },
    card: {
        marginRight: Spacing.sm,
        overflow: 'hidden',
    },
    cardPressable: {
        padding: Spacing.md,
    },
    scrollContent: {
        paddingRight: Spacing.xl, // Allow last card to be centered or shown fully
    },
    dismissBtn: {
        padding: Spacing.xs,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.xs,
    },
    iconTitle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    description: {
        marginBottom: Spacing.sm,
    },
    suggestion: {
        padding: Spacing.xs,
        borderRadius: 4,
    }
});
