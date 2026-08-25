import { AccountCategoryPill } from '@/src/components/common/AccountCategoryPill';
import { ArchivedAccountIndicator } from '@/src/components/common/ArchivedAccountIndicator';
import { AppIcon, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import type { AccountFields } from '@/src/types/plainDtos';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountType } from '@/src/types/enums';
import { TabType } from '@/src/types/domainJournal';
import { isAccountArchived } from '@/src/utils/accountArchive';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { getAccountIcon } from '@/src/components/account-selection';
import React, { useMemo } from 'react';
import { Keyboard, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

interface JournalSuggestionsProps {
  suggestions: JournalAutofillSuggestion[];
  state: 'loading' | 'empty' | 'error' | 'results';
  accounts?: AccountFields[];
  onSelect: (suggestion: JournalAutofillSuggestion) => void;
  activeTabType?: TabType;
}

function resolveVisibleAccount(
  suggestion: JournalAutofillSuggestion,
  accountsMap: Map<string, AccountFields>,
  tabType?: TabType,
): AccountFields | undefined {
  if (!suggestion.targetAccountId || !suggestion.targetAccountType) return undefined;

  if (tabType === 'expense' && suggestion.targetAccountType !== AccountType.EXPENSE) {
    return undefined;
  }
  if (tabType === 'income' && suggestion.targetAccountType !== AccountType.INCOME) {
    return undefined;
  }
  if (
    tabType === 'transfer' &&
    suggestion.targetAccountType !== AccountType.ASSET &&
    suggestion.targetAccountType !== AccountType.LIABILITY
  ) {
    return undefined;
  }

  return accountsMap.get(suggestion.targetAccountId);
}

export function JournalSuggestions({
  suggestions,
  state,
  accounts = [],
  onSelect,
  activeTabType,
}: JournalSuggestionsProps) {
  const { theme } = useTheme();

  const accountsMap = useMemo(() => {
    return new Map<string, AccountFields>(accounts.map(a => [a.id, a]));
  }, [accounts]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: '#000',
        },
      ]}
    >
      {state !== 'results' ? (
        <View style={styles.statusContainer}>
          <AppText variant="caption" color="secondary">
            {state === 'loading'
              ? 'Looking for previous descriptions…'
              : state === 'error'
                ? 'Suggestions are unavailable right now.'
                : 'No matching previous descriptions.'}
          </AppText>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="always" style={styles.scrollView}>
          {suggestions.map((suggestion, index) => {
            const targetAccount = resolveVisibleAccount(suggestion, accountsMap, activeTabType);
            const fallbackBadgeName =
              !targetAccount && suggestion.targetAccountName && !activeTabType
                ? suggestion.targetAccountName
                : undefined;

            let badgeContent: React.ReactNode = null;

            if (targetAccount) {
              const { accentColor, categoryColor } = resolveAccountAppearance(targetAccount, theme);
              const icon = getAccountIcon(targetAccount);
              const isArchived = isAccountArchived(targetAccount);

              badgeContent = (
                <View
                  style={[
                    styles.categoryBadge,
                    {
                      backgroundColor: withOpacity(accentColor, Opacity.soft),
                      borderColor: withOpacity(accentColor, Opacity.muted),
                    },
                  ]}
                >
                  <AccountCategoryPill color={categoryColor} size="sm" />
                  <AppIcon
                    name={icon}
                    size={Size.iconXs}
                    color={accentColor}
                    fallbackIcon="wallet"
                  />
                  <AppText
                    variant="caption"
                    color="text"
                    weight="semibold"
                    numberOfLines={1}
                    style={styles.badgeText}
                  >
                    {targetAccount.name}
                  </AppText>
                  {isArchived && <ArchivedAccountIndicator />}
                </View>
              );
            } else if (fallbackBadgeName) {
              badgeContent = (
                <View
                  style={[
                    styles.categoryBadge,
                    {
                      backgroundColor: theme.surfaceSecondary,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    color="secondary"
                    weight="medium"
                    numberOfLines={1}
                    style={styles.badgeText}
                  >
                    {fallbackBadgeName}
                  </AppText>
                </View>
              );
            }

            return (
              <TouchableOpacity
                key={`${suggestion.description}-${index}`}
                style={[
                  styles.suggestionItem,
                  {
                    borderBottomColor: theme.border,
                    borderBottomWidth:
                      index === suggestions.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  },
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  onSelect(suggestion);
                }}
              >
                <View style={styles.itemContent}>
                  <View style={styles.leftContent}>
                    <AppIcon name="clock" size={12} color={theme.textTertiary} />
                    <AppText
                      variant="body"
                      color="text"
                      weight="medium"
                      style={styles.suggestionText}
                      numberOfLines={1}
                    >
                      {suggestion.description}
                    </AppText>
                  </View>

                  <View style={styles.badgeContent}>
                    {suggestion.confidence !== undefined && badgeContent && (
                      <AppText variant="caption" color="secondary" style={styles.confidenceText}>
                        {Math.round(suggestion.confidence * 100)}% match
                      </AppText>
                    )}
                    {badgeContent}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    maxHeight: 240,
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    zIndex: 1000,
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    marginTop: Spacing.xs,
    overflow: 'hidden',
  },
  scrollView: {
    width: '100%',
  },
  statusContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  suggestionItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  badgeContent: {
    alignItems: 'flex-end',
    gap: 2,
  },
  confidenceText: {
    fontSize: 10,
  },
  leftContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  suggestionText: {
    flexShrink: 1,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: Shape.radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    maxWidth: 160,
  },
  badgeText: {
    flexShrink: 1,
    maxWidth: 100,
  },
});
