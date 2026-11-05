import { AppText, PressScaleTouchable } from '@/src/components/core';
import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import { Size, Spacing } from '@/src/constants/design-tokens';
import type { AccountMatcherDefinitionV1 } from '@/src/types/accountMatcher';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SmsPhraseList } from './SelectableSmsText';

export function AccountMatcherConditions({
  definition,
  privateMode,
  matcherId,
}: {
  definition: AccountMatcherDefinitionV1 | null;
  privateMode: boolean;
  matcherId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!definition) return null;
  const body = definition.body;
  return (
    <View style={styles.conditions}>
      <AppText variant="bodySmall" weight="medium" testID={`account-matcher-flow-${matcherId}`}>
        {definition.flow === 'incoming'
          ? copy.flowIncomingSummary
          : definition.flow === 'outgoing'
            ? copy.flowOutgoingSummary
            : copy.flowEitherSummary}
      </AppText>
      {body ? (
        <>
          <PressScaleTouchable
            onPress={() => setExpanded(value => !value)}
            style={styles.disclosure}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={expanded ? copy.hideConditions : copy.viewConditions}
            testID={`account-matcher-conditions-${matcherId}`}
          >
            <AppText variant="bodySmall" color="secondary" style={styles.summary}>
              {body.kind === 'fragments'
                ? copy.requiredPhrasesInOrder(body.fragments.length)
                : copy.regexCondition}
            </AppText>
            <AppText variant="caption" color="primary">
              {expanded ? copy.hideConditions : copy.viewConditions}
            </AppText>
          </PressScaleTouchable>
          {expanded ? (
            body.kind === 'fragments' ? (
              <SmsPhraseList phrases={body.fragments} privateMode={privateMode} />
            ) : (
              <AppText variant="bodySmall">
                {privateMode ? copy.privateMessage : `/${body.pattern}/`}
              </AppText>
            )
          ) : null}
        </>
      ) : (
        <AppText variant="bodySmall" color="secondary">
          {copy.anyMessageContent}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  conditions: { gap: Spacing.sm },
  disclosure: {
    minHeight: Size.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: Spacing.md,
    rowGap: Spacing.xs,
  },
  summary: { flexGrow: 1, flexShrink: 1 },
});
