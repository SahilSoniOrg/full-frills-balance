import {
  AppText,
  AppIcon,
  Icon,
  IconTile,
  PressScaleTouchable,
  ListGroup,
} from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import {
  AppConfig,
  JOURNAL_DETAILS_LAYOUT,
  JOURNAL_DETAILS_LIMITS,
  Size,
  Spacing,
} from '@/src/constants';
import { Inline, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountType } from '@/src/types/enums';
import {
  isBalanceAccount,
  type JournalEntriesPresentation,
  type JournalSplitItemViewModel,
} from '../../journalDetailsPresentation';

const ENTRY_TEXT_INSET = Spacing.md + Size.lg + Spacing.sm;

function EntryRow({
  item,
  currencyCode,
  balanceOnly,
  posted,
}: {
  item: JournalSplitItemViewModel;
  currencyCode: string;
  balanceOnly: boolean;
  posted: boolean;
}) {
  const formatMoney = useMoneyFormat();
  const privateMode = useEffectivePrivacyMode();
  const strings = AppConfig.strings.journalDetails;
  const foreign = item.currencyCode.toUpperCase() !== currencyCode.toUpperCase();
  const subtitle: string[] = [];
  if (balanceOnly)
    subtitle.push(item.accountType === AccountType.LIABILITY ? strings.owed : strings.balance);
  else {
    if (foreign)
      subtitle.push(
        `${formatMoney(item.amount, item.currencyCode)}${
          item.exchangeRate === undefined
            ? ''
            : ` @ ${privateMode ? AppConfig.privacyMask : item.exchangeRate.toLocaleString(undefined, { maximumFractionDigits: JOURNAL_DETAILS_LIMITS.exchangeRateFractionDigits })}`
        }`,
      );
    if (posted && isBalanceAccount(item))
      subtitle.push(
        item.runningBalance === undefined
          ? strings.balanceUnavailable
          : item.accountType === AccountType.LIABILITY
            ? strings.owedAfter(formatMoney(item.runningBalance, item.currencyCode))
            : strings.after(formatMoney(item.runningBalance, item.currencyCode)),
      );
    if (subtitle.length === 0 && item.accountType)
      subtitle.push(strings.accountTypes[item.accountType]);
  }
  const value = balanceOnly ? item.runningBalance : item.journalValue;
  return (
    <PressScaleTouchable
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={item.accountName}
      testID={`journal-entry-${item.id}`}
    >
      <Inline
        space="sm"
        padding="md"
        minHeight={Size.touchTargetLg}
        alignItems="center"
        flexWrap="wrap"
      >
        <Inline
          space="sm"
          alignItems="flex-start"
          flexGrow={1}
          flexShrink={1}
          flexBasis={JOURNAL_DETAILS_LAYOUT.entryIdentityBasis}
        >
          <IconTile icon={item.icon} tint={item.tint} />
          <Stack space="xs" flex={1} minWidth={0}>
            <AppText variant="body" weight="semibold">
              {item.accountName}
            </AppText>
            <AppText variant="caption" color="secondary">
              {subtitle.join(' · ')}
            </AppText>
            {item.notes ? <AppText variant="body">{item.notes}</AppText> : null}
          </Stack>
        </Inline>
        <Inline space="xs" alignItems="center" maxWidth="100%" flexShrink={1}>
          {value === undefined ? (
            <AppText variant="caption" color="warning">
              {balanceOnly ? strings.balanceUnavailable : strings.valueUnavailable}
            </AppText>
          ) : (
            <MoneyText
              amount={value}
              currencyCode={balanceOnly ? item.currencyCode : currencyCode}
              variant="body"
              style={{ flexShrink: 1 }}
            />
          )}
          <AppIcon name={Icon.ChevronRight} size={Size.iconXs} color="textSecondary" />
        </Inline>
      </Inline>
    </PressScaleTouchable>
  );
}

function Balanced({ currency }: { currency?: string }) {
  const { theme } = useTheme();
  const strings = AppConfig.strings.journalDetails;
  return (
    <AppText variant="caption" color="income" contrastOn={theme.background}>
      {strings.balancedMark(currency ? strings.balancedIn(currency) : strings.balanced)}
    </AppText>
  );
}

export function JournalEntries({ entries }: { entries: JournalEntriesPresentation }) {
  const formatMoney = useMoneyFormat();
  const { currencyCode } = entries;
  const strings = AppConfig.strings.journalDetails;
  if (entries.shape === 'one-to-one') {
    if (entries.balanceItems.length === 0) return null;
    return (
      <ListGroup
        header={strings.afterJournal}
        headerAccessory={entries.balanced ? <Balanced /> : undefined}
        dividerInset={ENTRY_TEXT_INSET}
        testID="journal-after-balances"
      >
        {entries.balanceItems.map(item => (
          <EntryRow key={item.id} item={item} currencyCode={currencyCode} balanceOnly posted />
        ))}
      </ListGroup>
    );
  }
  return (
    <Stack space="lg" testID="journal-split">
      {entries.groups.map((group, groupIndex) => (
        <ListGroup
          key={group.label}
          header={`${group.label} · ${group.total === undefined ? strings.totalUnavailable : formatMoney(group.total, currencyCode)}`}
          headerAccessory={
            groupIndex === 0 && entries.balanced ? <Balanced currency={currencyCode} /> : undefined
          }
          dividerInset={ENTRY_TEXT_INSET}
        >
          {group.items.map(item => (
            <EntryRow
              key={item.id}
              item={item}
              currencyCode={currencyCode}
              balanceOnly={false}
              posted={entries.posted}
            />
          ))}
        </ListGroup>
      ))}
    </Stack>
  );
}
