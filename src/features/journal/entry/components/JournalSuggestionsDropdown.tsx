import { AccountCategoryPill } from '@/src/components/accounts/AccountCategoryPill';
import { getAccountIcon } from '@/src/components/account-selection';
import { Icon, AppIcon, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import type { JournalAutofillSuggestion } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { useTheme } from '@/src/hooks/use-theme';
import { TabType } from '@/src/types/domainJournal';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountType } from '@/src/types/enums';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { withOpacity } from '@/src/utils/color-math';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

const MAX_VISIBLE_SUGGESTIONS = 8;

export type JournalSuggestionState = 'idle' | 'loading' | 'empty' | 'error' | 'results';

export function resolveSuggestionAccount(
  suggestion: JournalAutofillSuggestion,
  accountsMap: Map<string, AccountFields>,
  tabType?: TabType,
): AccountFields | undefined {
  if (!suggestion.targetAccountId || !suggestion.targetAccountType) return undefined;
  if (tabType === 'expense' && suggestion.targetAccountType !== AccountType.EXPENSE)
    return undefined;
  if (tabType === 'income' && suggestion.targetAccountType !== AccountType.INCOME) return undefined;
  if (
    tabType === 'transfer' &&
    suggestion.targetAccountType !== AccountType.ASSET &&
    suggestion.targetAccountType !== AccountType.LIABILITY
  ) {
    return undefined;
  }
  return accountsMap.get(suggestion.targetAccountId);
}

export function filterJournalSuggestions(
  suggestions: JournalAutofillSuggestion[],
  accountsMap: Map<string, AccountFields>,
  tabType?: TabType,
): JournalAutofillSuggestion[] {
  const seen = new Set<string>();

  return suggestions.filter(suggestion => {
    const targetAccount = resolveSuggestionAccount(suggestion, accountsMap, tabType);
    const key = `${suggestion.description.trim().toLowerCase()}:${targetAccount?.id ?? 'none'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface JournalSuggestionsDropdownProps {
  visible: boolean;
  hideSuggestions?: boolean;
  suggestions?: JournalAutofillSuggestion[];
  suggestionState?: JournalSuggestionState;
  activeTabType?: TabType;
  accounts?: AccountFields[];
  onSelectSuggestion: (suggestion: JournalAutofillSuggestion) => void;
}

export const JournalSuggestionsDropdown = React.memo(function JournalSuggestionsDropdown({
  visible,
  hideSuggestions = false,
  suggestions = [],
  suggestionState = 'idle',
  activeTabType,
  accounts = [],
  onSelectSuggestion,
}: JournalSuggestionsDropdownProps) {
  const { theme } = useTheme();
  const accountsMap = useMemo(
    () => new Map<string, AccountFields>(accounts.map(account => [account.id, account])),
    [accounts],
  );
  const visibleSuggestions = useMemo(
    () => filterJournalSuggestions(suggestions, accountsMap, activeTabType),
    [accountsMap, activeTabType, suggestions],
  );

  if (!visible || hideSuggestions || suggestionState === 'idle') return null;

  return (
    <View
      style={[
        styles.dropdownLayer,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.border,
        },
      ]}
    >
      {suggestionState !== 'results' || visibleSuggestions.length === 0 ? (
        <AppText variant="caption" color="secondary" style={styles.suggestionStatus}>
          {suggestionState === 'loading'
            ? 'Looking for previous descriptions…'
            : suggestionState === 'error'
              ? 'Suggestions are unavailable right now.'
              : 'No matching previous descriptions.'}
        </AppText>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          style={styles.dropdownScrollView}
          contentContainerStyle={styles.dropdownScrollContent}
        >
          <View style={styles.dropdownWrapContainer}>
            {visibleSuggestions.slice(0, MAX_VISIBLE_SUGGESTIONS).map(suggestion => {
              const targetAccount = resolveSuggestionAccount(
                suggestion,
                accountsMap,
                activeTabType,
              );
              const { accentColor, categoryColor } = targetAccount
                ? resolveAccountAppearance(targetAccount, theme)
                : { accentColor: theme.primary, categoryColor: theme.primary };
              const accountIcon = targetAccount ? getAccountIcon(targetAccount) : undefined;

              return (
                <TouchableOpacity
                  key={`${suggestion.description}:${targetAccount?.id ?? 'none'}`}
                  onPress={() => onSelectSuggestion(suggestion)}
                  style={[
                    styles.sparsePill,
                    {
                      backgroundColor: withOpacity(accentColor, Opacity.soft),
                      borderColor: withOpacity(accentColor, Opacity.medium),
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Suggestion: ${suggestion.description}`}
                >
                  <AppText
                    variant="body"
                    weight="semibold"
                    style={[styles.pillTitle, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {suggestion.description}
                  </AppText>

                  {targetAccount && (
                    <View
                      style={[
                        styles.pillAccountBadge,
                        {
                          backgroundColor: withOpacity(accentColor, Opacity.soft),
                          borderColor: withOpacity(accentColor, Opacity.active),
                        },
                      ]}
                    >
                      <AccountCategoryPill color={categoryColor} size="sm" />
                      {accountIcon && (
                        <AppIcon
                          name={accountIcon}
                          size={Size.xxs}
                          color={accentColor}
                          fallbackIcon={Icon.Wallet}
                        />
                      )}
                      <AppText
                        variant="caption"
                        weight="semibold"
                        style={{ color: accentColor }}
                        numberOfLines={1}
                      >
                        {targetAccount.name}
                      </AppText>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  dropdownLayer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: Spacing.xs,
    borderRadius: Shape.radius.lg,
    borderWidth: 1,
    padding: Spacing.sm,
    zIndex: 1000,
    ...Shape.elevation.lg,
    maxHeight: 220,
  },
  dropdownScrollView: {
    width: '100%',
    maxHeight: 200,
    borderRadius: Shape.radius.lg,
  },
  dropdownScrollContent: {
    width: '100%',
    flexGrow: 0,
  },
  suggestionStatus: {
    padding: Spacing.md,
  },
  dropdownWrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    width: '100%',
    alignItems: 'center',
  },
  sparsePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    maxWidth: '100%',
  },
  pillTitle: {
    fontSize: Typography.sizes.sm,
    flexShrink: 1,
  },
  pillAccountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
    flexShrink: 0,
  },
});
