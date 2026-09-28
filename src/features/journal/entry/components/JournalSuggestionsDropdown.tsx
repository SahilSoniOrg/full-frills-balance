import { Icon, AppIcon, AppText } from '@/src/components/core';
import { getAccountIcon } from '@/src/components/account-selection';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import type { JournalSuggestion } from '@/src/types/journalSuggestions';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { useTheme } from '@/src/hooks/use-theme';
import { TabType } from '@/src/types/domainJournal';
import type { AccountFields } from '@/src/types/plainDtos';
import { AccountType } from '@/src/types/enums';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { withOpacity } from '@/src/utils/color-math';
import { formatRelativeReconciledDate } from '@/src/utils/dateUtils';
import React, { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ScrollView, State } from 'react-native-gesture-handler';

const MAX_VISIBLE_SUGGESTIONS = 6;

export type JournalSuggestionState = 'idle' | 'loading' | 'empty' | 'error' | 'results';

export function resolveSuggestionAccount(
  suggestion: JournalSuggestion,
  accountsMap: Map<string, AccountFields>,
  tabType?: TabType,
): AccountFields | undefined {
  const accountId =
    tabType === 'expense'
      ? suggestion.route.destinations[0]?.id
      : tabType === 'income'
        ? suggestion.route.sources[0]?.id
        : (suggestion.route.destinations[0]?.id ?? suggestion.route.sources[0]?.id);
  if (!accountId) return undefined;
  const account = accountsMap.get(accountId);
  const routeAccount = [...suggestion.route.sources, ...suggestion.route.destinations].find(
    item => item.id === accountId,
  );
  const accountType = account?.accountType ?? routeAccount?.type;
  if (tabType === 'expense' && accountType !== AccountType.EXPENSE) return undefined;
  if (tabType === 'income' && accountType !== AccountType.INCOME) return undefined;
  return account;
}

export function filterJournalSuggestions(
  suggestions: JournalSuggestion[],
  accountsMap: Map<string, AccountFields>,
  tabType?: TabType,
): JournalSuggestion[] {
  return suggestions.filter(suggestion => {
    const accountIds = [
      ...suggestion.route.sources.map(account => account.id),
      ...suggestion.route.destinations.map(account => account.id),
    ];
    return (
      accountIds.every(id => accountsMap.has(id)) &&
      Boolean(resolveSuggestionAccount(suggestion, accountsMap, tabType))
    );
  });
}

export interface JournalSuggestionsDropdownProps {
  visible: boolean;
  hideSuggestions?: boolean;
  suggestions?: JournalSuggestion[];
  suggestionState?: JournalSuggestionState;
  activeTabType?: TabType;
  accounts?: AccountFields[];
  onSelectSuggestion: (suggestion: JournalSuggestion) => void;
  onInteractionChange?: (interacting: boolean) => void;
  maxHeight?: number;
}

export const JournalSuggestionsDropdown = React.memo(function JournalSuggestionsDropdown({
  visible,
  hideSuggestions = false,
  suggestions = [],
  suggestionState = 'idle',
  activeTabType,
  accounts = [],
  onSelectSuggestion,
  onInteractionChange,
  maxHeight = 220,
}: JournalSuggestionsDropdownProps) {
  const { theme } = useTheme();
  const { resolvedHourCycle } = useHourCyclePrefs();
  const isDraggingRef = useRef(false);
  const accountsMap = useMemo(
    () => new Map<string, AccountFields>(accounts.map(account => [account.id, account])),
    [accounts],
  );
  const visibleSuggestions = useMemo(
    () => filterJournalSuggestions(suggestions, accountsMap, activeTabType),
    [accountsMap, activeTabType, suggestions],
  );

  if (!visible || hideSuggestions || suggestionState === 'idle' || suggestionState === 'loading')
    return null;

  return (
    <View
      style={[
        styles.dropdownLayer,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.border,
          maxHeight,
        },
      ]}
    >
      {suggestionState !== 'results' || visibleSuggestions.length === 0 ? (
        <View style={styles.suggestionStatus}>
          <AppText variant="caption" color="secondary">
            {suggestionState === 'error'
              ? 'Suggestions are unavailable right now.'
              : 'No previous descriptions match.'}
          </AppText>
        </View>
      ) : (
        <ScrollView
          testID="journal-suggestions-scroll-view"
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          disallowInterruption
          nestedScrollEnabled
          onTouchStart={() => {
            onInteractionChange?.(true);
          }}
          onTouchEnd={() => onInteractionChange?.(isDraggingRef.current)}
          // A parent scroll cancels this responder before its drag callback runs.
          // Keep the field focused until this native scroll ends or is cancelled.
          onTouchCancel={() => {
            isDraggingRef.current = true;
            onInteractionChange?.(true);
          }}
          onScrollBeginDrag={() => {
            isDraggingRef.current = true;
            onInteractionChange?.(true);
          }}
          onScrollEndDrag={() => {
            isDraggingRef.current = false;
            onInteractionChange?.(false);
          }}
          onHandlerStateChange={({ nativeEvent: { state } }) => {
            if (state === State.ACTIVE) {
              isDraggingRef.current = true;
              onInteractionChange?.(true);
            } else if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
              isDraggingRef.current = false;
              onInteractionChange?.(false);
            }
          }}
          showsVerticalScrollIndicator={false}
          style={[
            styles.dropdownScrollView,
            { maxHeight: Math.max(0, maxHeight - Spacing.sm * 2) },
          ]}
          contentContainerStyle={styles.dropdownScrollContent}
        >
          <View style={styles.suggestionList}>
            {visibleSuggestions.slice(0, MAX_VISIBLE_SUGGESTIONS).map(suggestion => {
              const targetAccount = resolveSuggestionAccount(
                suggestion,
                accountsMap,
                activeTabType,
              );
              const sourceAccounts = suggestion.route.sources
                .map(account => accountsMap.get(account.id))
                .filter((account): account is AccountFields => Boolean(account));
              const destinationAccounts = suggestion.route.destinations
                .map(account => accountsMap.get(account.id))
                .filter((account): account is AccountFields => Boolean(account));
              const sourceAccount = sourceAccounts[0];
              const destinationAccount = destinationAccounts[0];
              const lastUsedLabel = formatRelativeReconciledDate(
                suggestion.history.lastUsedAt,
                resolvedHourCycle,
              );
              const { accentColor } = targetAccount
                ? resolveAccountAppearance(targetAccount, theme)
                : { accentColor: theme.primary };
              const sourceColor = sourceAccount
                ? resolveAccountAppearance(sourceAccount, theme).accentColor
                : theme.textSecondary;
              const renderAccount = (account: AccountFields) => {
                const color = resolveAccountAppearance(account, theme).accentColor;
                return (
                  <View key={account.id} style={styles.accountLeg}>
                    <AppIcon name={getAccountIcon(account)} size={Size.xxs} color={color} />
                    <AppText
                      variant="caption"
                      style={[styles.accountName, { color }]}
                      numberOfLines={1}
                    >
                      {account.name}
                    </AppText>
                  </View>
                );
              };

              return (
                <Pressable
                  key={suggestion.key}
                  onPress={() => onSelectSuggestion(suggestion)}
                  style={({ pressed }) => [
                    styles.suggestionPill,
                    {
                      backgroundColor: pressed
                        ? withOpacity(accentColor, Opacity.active)
                        : withOpacity(accentColor, Opacity.soft),
                      borderColor: withOpacity(accentColor, Opacity.active),
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${suggestion.description}${sourceAccounts.length || destinationAccounts.length ? `, ${sourceAccounts.map(account => account.name).join(', ') || 'Unknown account'} to ${destinationAccounts.map(account => account.name).join(', ') || 'Unknown account'}` : targetAccount ? `, ${targetAccount.name}` : ''}`}
                  accessibilityHint={`Last used ${lastUsedLabel}`}
                >
                  <View style={styles.suggestionCopy}>
                    <View style={styles.suggestionHeading}>
                      <AppText
                        variant="caption"
                        weight="semibold"
                        style={[
                          styles.suggestionDescription,
                          { color: theme.text, fontSize: Typography.sizes.sm },
                        ]}
                        numberOfLines={1}
                      >
                        {suggestion.description}
                      </AppText>
                      <AppText
                        variant="caption"
                        style={[styles.lastUsedDate, { color: theme.textTertiary }]}
                        numberOfLines={1}
                      >
                        {lastUsedLabel}
                      </AppText>
                    </View>
                    {(sourceAccount || destinationAccount || targetAccount) && (
                      <View style={styles.accountRoute}>
                        <View style={styles.routeSide}>
                          {sourceAccounts.length ? (
                            sourceAccounts.map(renderAccount)
                          ) : !destinationAccounts.length && targetAccount ? (
                            <AppText
                              variant="caption"
                              style={[styles.accountName, { color: sourceColor }]}
                              numberOfLines={1}
                            >
                              {targetAccount.name}
                            </AppText>
                          ) : null}
                        </View>
                        {sourceAccounts.length > 0 && destinationAccounts.length > 0 && (
                          <View style={styles.routeArrow}>
                            <AppIcon
                              name={Icon.ArrowRight}
                              size={Size.xxs}
                              color={theme.textTertiary}
                            />
                          </View>
                        )}
                        <View style={styles.routeSide}>
                          {destinationAccounts.map(renderAccount)}
                        </View>
                      </View>
                    )}
                  </View>
                </Pressable>
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
    borderRadius: Shape.radius.md,
    borderWidth: 1,
    padding: Spacing.xs,
    zIndex: 1000,
    ...Shape.elevation.md,
  },
  dropdownScrollView: {
    width: '100%',
    maxHeight: 200,
  },
  dropdownScrollContent: {
    width: '100%',
    flexGrow: 0,
  },
  suggestionStatus: {
    minHeight: Size.buttonMd,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  suggestionList: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  suggestionPill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.sm,
    borderWidth: 1,
  },
  suggestionCopy: {
    minWidth: 0,
    gap: 2,
  },
  suggestionHeading: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  accountRoute: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 0,
  },
  routeSide: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
    minWidth: 0,
    flexShrink: 1,
  },
  routeArrow: {
    alignSelf: 'center',
  },
  accountLeg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 0,
    flexShrink: 1,
  },
  suggestionDescription: {
    fontSize: Typography.sizes.sm,
    flexShrink: 1,
  },
  lastUsedDate: {
    flexShrink: 0,
    fontSize: 11,
  },
  accountName: {
    minWidth: 0,
    flexShrink: 1,
  },
});
