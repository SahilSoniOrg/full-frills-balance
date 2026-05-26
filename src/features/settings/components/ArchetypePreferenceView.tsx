import { AppIcon, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { ARCHETYPES, getArchetypeById } from '@/src/constants/archetypes';
import { useTheme } from '@/src/hooks/use-theme';
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SettingsMenuItem } from '@/src/features/settings/components/SettingsMenuItem';

interface ArchetypePreferenceViewProps {
  currentArchetypeId: string;
  onSelect: (id: string) => Promise<void>;
}

export const ArchetypePreferenceView = ({
  currentArchetypeId,
  onSelect,
}: ArchetypePreferenceViewProps) => {
  const { theme } = useTheme();
  const [showModal, setShowModal] = useState(false);

  const currentArchetype = getArchetypeById(currentArchetypeId);

  const handleSelect = async (id: string) => {
    await onSelect(id);
    setShowModal(false);
  };

  return (
    <>
      <SettingsMenuItem
        title="Financial Archetype"
        description="Personalize your insights"
        onPress={() => setShowModal(true)}
        hasArrow={false}
        rightContent={
          <View
            style={[
              styles.selector,
              { borderColor: theme.border, backgroundColor: theme.surfaceSecondary },
            ]}
          >
            <AppIcon
              name={currentArchetype.icon}
              size={16}
              color={theme.textSecondary}
              style={{ marginRight: Spacing.xs }}
            />
            <AppText variant="caption" weight="medium" style={{ marginRight: Spacing.xs }}>
              {currentArchetype.name.replace(/^The /, '')}
            </AppText>
            <AppIcon
              name="chevronRight"
              size={12}
              color={theme.textSecondary}
              style={{ opacity: Opacity.medium }}
            />
          </View>
        }
      />

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
              {ARCHETYPES.map(archetype => (
                <TouchableOpacity
                  key={archetype.id}
                  style={[
                    styles.archetypeItem,
                    { borderBottomColor: theme.border },
                    currentArchetypeId === archetype.id && {
                      backgroundColor: withOpacity(theme.primary, Opacity.ghost),
                    },
                  ]}
                  onPress={() => handleSelect(archetype.id)}
                >
                  <View
                    style={[
                      styles.iconContainer,
                      {
                        backgroundColor:
                          currentArchetypeId === archetype.id
                            ? theme.primary
                            : theme.surfaceSecondary,
                      },
                    ]}
                  >
                    <AppIcon
                      name={archetype.icon}
                      size={Size.md}
                      color={currentArchetypeId === archetype.id ? theme.onPrimary : theme.text}
                    />
                  </View>
                  <View style={styles.archetypeText}>
                    <AppText variant="body" weight="semibold">
                      {archetype.name}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {archetype.description}
                    </AppText>
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
