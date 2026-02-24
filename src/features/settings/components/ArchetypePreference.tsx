import { AppIcon, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { ARCHETYPES, getArchetypeById } from '@/src/constants/archetypes';
import { useUI } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export const ArchetypePreference = () => {
    const { theme } = useTheme();
    const { archetype: currentArchetypeId, setArchetype } = useUI();
    const [showModal, setShowModal] = useState(false);

    const currentArchetype = getArchetypeById(currentArchetypeId);

    const handleSelect = async (id: string) => {
        await setArchetype(id);
        setShowModal(false);
    };

    return (
        <>
            <View style={styles.rowBetween}>
                <View style={styles.textContainer}>
                    <AppText variant="body" weight="semibold">Financial Archetype</AppText>
                    <AppText variant="caption" color="secondary" numberOfLines={1} ellipsizeMode="tail">
                        Personalize your insights
                    </AppText>
                </View>
                <TouchableOpacity
                    onPress={() => setShowModal(true)}
                    style={[styles.selector, { borderColor: theme.border, backgroundColor: theme.surfaceSecondary }]}
                >
                    <AppIcon name={currentArchetype.icon} size={Size.xs} color={theme.primary} style={{ marginRight: Spacing.xs }} />
                    <AppText variant="caption" weight="semibold" style={{ marginRight: Spacing.xs }}>
                        {currentArchetype.name.replace(/^The /, '')}
                    </AppText>
                    <AppIcon name="chevronRight" size={Size.xxs} color={theme.textSecondary} />
                </TouchableOpacity>
            </View>

            <Modal
                visible={showModal}
                animationType="slide"
                transparent
                onRequestClose={() => setShowModal(false)}
            >
                <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                    <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                            <AppText variant="heading">Choose Your Style</AppText>
                            <TouchableOpacity onPress={() => setShowModal(false)}>
                                <AppIcon name="close" size={Typography.sizes.xxl} color={theme.text} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={styles.scrollContent}>
                            {ARCHETYPES.map((archetype) => (
                                <TouchableOpacity
                                    key={archetype.id}
                                    style={[
                                        styles.archetypeItem,
                                        { borderBottomColor: theme.border },
                                        currentArchetypeId === archetype.id && { backgroundColor: withOpacity(theme.primary, Opacity.soft / 2) },
                                    ]}
                                    onPress={() => handleSelect(archetype.id)}
                                >
                                    <View style={[styles.iconContainer, { backgroundColor: currentArchetypeId === archetype.id ? theme.primary : theme.surfaceSecondary }]}>
                                        <AppIcon
                                            name={archetype.icon}
                                            size={Size.md}
                                            color={currentArchetypeId === archetype.id ? theme.onPrimary : theme.text}
                                        />
                                    </View>
                                    <View style={styles.archetypeText}>
                                        <AppText variant="body" weight="semibold">{archetype.name}</AppText>
                                        <AppText variant="caption" color="secondary">{archetype.description}</AppText>
                                    </View>
                                    {currentArchetypeId === archetype.id && (
                                        <AppIcon name="checkCircle" size={Size.sm} color={theme.primary} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    rowBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: Spacing.xs,
    },
    textContainer: {
        flex: 1,
        marginRight: Spacing.md,
    },
    selector: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        borderRadius: Shape.radius.full,
        borderWidth: 1,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        maxHeight: '70%',
        borderTopLeftRadius: Shape.radius.r3,
        borderTopRightRadius: Shape.radius.r3,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.lg,
        borderBottomWidth: 1,
    },
    scrollContent: {
        paddingBottom: Spacing.xl,
    },
    archetypeItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.lg,
        borderBottomWidth: 1,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: Spacing.md,
    },
    archetypeText: {
        flex: 1,
        marginRight: Spacing.sm,
    },
});
