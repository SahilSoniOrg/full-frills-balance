import { AppText } from '@/src/components/core';
import { CalculatorAmountInput } from '@/src/components/forms/CalculatorAmountInput';
import { Shape, Spacing, Typography } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import type { TabType } from '@/src/types/domainJournal';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { ExchangeRateCard, type ExchangeRateCardProps } from './ExchangeRateCard';
import { JournalMetaCard, type JournalMetaCardProps } from './JournalMetaCard';
import { SimpleFormAmountInput } from './SimpleFormAmountInput';
import {
  SimpleFormAccountSections,
  type SimpleFormAccountSectionsProps,
} from './SimpleFormAccountSections';
import { TransactionTypeSegmentedControl } from './TransactionTypeSegmentedControl';

type HeroAmountProps = {
  variant: 'hero';
  amount: string;
  setAmount: (value: string) => void;
  currency: string;
  accentColor: string;
  precision?: number;
  autoOpenCalculator?: boolean;
  onCalculatorDone?: () => void;
};

type CompactAmountProps = {
  variant: 'compact';
  amount: string;
  currency: string;
  onChangeText: (value: string) => void;
  testID?: string;
};

export interface EntryTransactionCardProps {
  meta: JournalMetaCardProps;
  typeSwitcher?: {
    value: TabType;
    onChange: (value: TabType) => void;
    accentColor: string;
  };
  amount: HeroAmountProps | CompactAmountProps;
  exchangeRate: ExchangeRateCardProps;
  accountSections: SimpleFormAccountSectionsProps;
  metaContainerStyle?: StyleProp<ViewStyle>;
  exchangeRateContainerStyle?: StyleProp<ViewStyle>;
  accountSectionsContainerStyle?: StyleProp<ViewStyle>;
}

export function EntryTransactionCard({
  meta,
  typeSwitcher,
  amount,
  exchangeRate,
  accountSections,
  metaContainerStyle,
  exchangeRateContainerStyle,
  accountSectionsContainerStyle,
}: EntryTransactionCardProps) {
  return (
    <>
      <JournalMetaCard
        {...meta}
        containerStyle={[styles.sectionSpacing, meta.containerStyle, metaContainerStyle]}
      />
      {amount.variant === 'hero' && typeSwitcher && (
        <TransactionTypeSegmentedControl {...typeSwitcher} variant="standard" />
      )}
      {amount.variant === 'hero' ? (
        <HeroAmountInput {...amount} />
      ) : (
        <CompactAmountInput {...amount} typeSwitcher={typeSwitcher} />
      )}
      <ExchangeRateCard
        {...exchangeRate}
        containerStyle={[styles.sectionSpacing, exchangeRateContainerStyle]}
      />
      <SimpleFormAccountSections
        {...accountSections}
        displayMode={amount.variant === 'compact' ? 'compact' : 'standard'}
        containerStyle={accountSectionsContainerStyle}
      />
    </>
  );
}

function HeroAmountInput({
  amount,
  setAmount,
  currency,
  accentColor,
  precision,
  autoOpenCalculator,
  onCalculatorDone,
}: HeroAmountProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.heroAmount, { backgroundColor: theme.background }]}>
      <SimpleFormAmountInput
        amount={amount}
        setAmount={setAmount}
        currency={currency}
        accentColor={accentColor}
        precision={precision}
        autoOpenCalculator={autoOpenCalculator}
        onCalculatorDone={onCalculatorDone}
      />
    </View>
  );
}

function CompactAmountInput({
  amount,
  currency,
  onChangeText,
  testID,
  typeSwitcher,
}: CompactAmountProps & { typeSwitcher?: EntryTransactionCardProps['typeSwitcher'] }) {
  const { theme } = useTheme();

  return (
    <View style={styles.amountMetaRow}>
      {typeSwitcher && <TransactionTypeSegmentedControl {...typeSwitcher} variant="compact" />}
      <View
        style={[
          styles.amountWrapper,
          { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
        ]}
      >
        <AppText
          variant="caption"
          weight="bold"
          style={[styles.currencyPrefix, { color: theme.textTertiary }]}
        >
          {currency}
        </AppText>
        <CalculatorAmountInput
          value={amount}
          onChangeText={onChangeText}
          placeholder="0.00"
          currencySymbol={currency}
          variant="minimal"
          containerStyle={styles.inputContainer}
          inputStyle={styles.amountInput}
          testID={testID}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroAmount: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.none,
    marginBottom: Spacing.sm,
    zIndex: 2,
  },
  amountMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionSpacing: {
    marginBottom: Spacing.sm,
  },
  amountWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    borderRadius: Shape.radius.r2,
    borderWidth: 1,
    paddingLeft: Spacing.sm,
  },
  currencyPrefix: {
    fontSize: Typography.sizes.xs,
    marginRight: Spacing.xs,
  },
  inputContainer: {
    flex: 1,
    minHeight: 0,
  },
  amountInput: {
    fontSize: Typography.sizes.base,
    height: 36,
    textAlign: 'right',
    flex: 1,
    paddingRight: Spacing.sm,
  },
});
