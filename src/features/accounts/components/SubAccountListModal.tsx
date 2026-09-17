import { useState, useEffect } from 'react';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Icon, AppButton, AppText, Badge, IconButton, IvyIcon } from '@/src/components/core';
import { ChromeMotion, Opacity, Shape, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { SubAccountViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface SubAccountListModalProps {
  visible: boolean;
  onClose: () => void;
  parentName: string;
  subAccounts: SubAccountViewModel[];
  isLoading: boolean;
}

export function SubAccountListModal({
  visible,
  onClose,
  parentName,
  subAccounts,
  isLoading,
}: SubAccountListModalProps) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();

  const [slideAnim] = useState(() => new Animated.Value(SCREEN_HEIGHT));

  useEffect(() => {
    if (visible) {
      if (reduceMotion) {
        slideAnim.setValue(0);
        return;
      }
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        ...ChromeMotion.rnSoftSpring,
      }).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
    }
  }, [visible, slideAnim, reduceMotion]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <Pressable style={[styles.overlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Animated.View
          style={[
            styles.modalContent,
            {
              backgroundColor: theme.surface,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headerCopy}>
              <AppText variant="subheading" weight="bold">
                Sub-Accounts
              </AppText>
              <AppText variant="caption" color="secondary">
                Details for &quot;{parentName}&quot;
              </AppText>
            </View>
            <IconButton
              name={Icon.Close}
              variant="clear"
              iconColor={theme.textSecondary}
              onPress={onClose}
              accessibilityLabel="Close"
            />
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <View style={styles.emptyContainer}>
                <AppText variant="body" color="secondary">
                  Loading sub-accounts...
                </AppText>
              </View>
            ) : subAccounts.length === 0 ? (
              <View style={styles.emptyContainer}>
                <AppText variant="body" color="secondary">
                  No sub-accounts found
                </AppText>
              </View>
            ) : (
              subAccounts.map((account, index) => (
                <View
                  key={`${account.id}-${index}`}
                  style={[styles.accountRow, { borderBottomColor: theme.divider }]}
                >
                  {account.level > 0 &&
                    Array.from({ length: account.level }).map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.indentation,
                          {
                            width: Spacing.lg,
                            borderLeftWidth: 1,
                            borderLeftColor: withOpacity(theme.textTertiary, Opacity.hover),
                          },
                        ]}
                      />
                    ))}
                  <View style={styles.accountLeft}>
                    <IvyIcon
                      name={account.icon}
                      fallbackIcon={account.icon || 'wallet'}
                      label={account.name}
                      color={account.accountColor}
                      size={36}
                      shape="square"
                    />
                    <AppText
                      variant="body"
                      weight="medium"
                      style={styles.accountName}
                      numberOfLines={1}
                    >
                      {account.name}
                    </AppText>
                    {account.isGroup && (
                      <Badge
                        variant="primary"
                        size="sm"
                        style={styles.badge}
                        backgroundColor={withOpacity(account.categoryColor, Opacity.hover)}
                        textColor={account.categoryColor}
                      >
                        Group
                      </Badge>
                    )}
                  </View>
                  <MoneyText
                    amount={account.balanceAmount}
                    currencyCode={account.currencyCode}
                    variant="body"
                    weight="bold"
                  />
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.footer}>
            <AppButton onPress={onClose} variant="ghost">
              Close
            </AppButton>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: Shape.radius.xl,
    borderTopRightRadius: Shape.radius.xl,
    maxHeight: '70%',
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.xl,
    borderBottomWidth: 1,
  },
  headerCopy: {
    flex: 1,
    marginRight: Spacing.md,
  },
  list: {
    paddingHorizontal: Spacing.xl,
  },
  listContent: {
    paddingVertical: Spacing.md,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accountName: {
    maxWidth: '50%',
    marginRight: Spacing.xs,
  },
  badge: {
    marginLeft: 0,
    alignSelf: 'center',
  },
  indentation: {
    height: 24,
    alignSelf: 'center',
  },
  emptyContainer: {
    padding: Spacing.xxl,
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
});
