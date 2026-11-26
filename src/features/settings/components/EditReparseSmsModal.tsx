import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, AppButton, AppCard, AppIcon, AppInput, AppText, Badge } from '@/src/components/core';
import { BulkActionModalSurface } from '@/src/components/overlays/BulkActionModalSurface';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { BorderWidth, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { smsService } from '@/src/services/sms-service';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { InboxParseStatus } from '@/src/types/enums';
import { TransactionInboxItem } from '@/src/types/domainJournal';
import { showErrorAlert } from '@/src/services/feedback/alerts';
import {
  bankEntrySign,
  signColorKey,
  signPrefix,
} from '@/src/domain/accounting/presentationPolicy';

interface EditReparseSmsModalProps {
  visible: boolean;
  item: TransactionInboxItem | null;
  defaultCurrencyCode: string;
  onClose: () => void;
  onDismiss?: () => void;
  onImportParsed: (item: TransactionInboxItem) => void;
}

export function EditReparseSmsModal({
  visible,
  item,
  defaultCurrencyCode,
  onClose,
  onDismiss,
  onImportParsed,
}: EditReparseSmsModalProps) {
  if (!item) return null;

  return (
    <EditReparseModalContent
      key={item.id}
      visible={visible}
      item={item}
      defaultCurrencyCode={defaultCurrencyCode}
      onClose={onClose}
      onDismiss={onDismiss}
      onImportParsed={onImportParsed}
    />
  );
}

interface EditReparseModalContentProps {
  visible: boolean;
  item: TransactionInboxItem;
  defaultCurrencyCode: string;
  onClose: () => void;
  onDismiss?: () => void;
  onImportParsed: (item: TransactionInboxItem) => void;
}

function EditReparseModalContent({
  visible,
  item,
  defaultCurrencyCode,
  onClose,
  onDismiss,
  onImportParsed,
}: EditReparseModalContentProps) {
  const { theme } = useTheme();
  const afterDismiss = useAfterDismiss();
  const mountedRef = useRef(true);
  const parseRequestRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const initialRaw = item.rawBody || '';
  const initialSender = item.senderAddress || '';

  const [rawText, setRawText] = useState(initialRaw);
  const [senderAddress, setSenderAddress] = useState(initialSender);
  const [isParsing, setIsParsing] = useState(false);
  const [lastParsedSource, setLastParsedSource] = useState<{
    rawText: string;
    senderAddress: string;
  } | null>({ rawText: initialRaw, senderAddress: initialSender });
  const [parsedResult, setParsedResult] = useState<ParsedTransaction | null>({
    id: item.deviceSourceId,
    amount: item.parsedAmount,
    currencyCode: item.parsedCurrencyCode,
    merchant: item.parsedMerchant,
    type: item.direction === 'credit' ? 'credit' : item.direction === 'debit' ? 'debit' : 'unknown',
    date: item.inputDate,
    rawBody: initialRaw,
    address: initialSender,
    accountSource: item.parsedAccountSource,
    referenceNumber: item.referenceNumber,
    confidence: item.parseConfidence ?? 0,
    parseStatus: (item.parseStatus as InboxParseStatus) || InboxParseStatus.PARSED,
    parseReason: item.parseReason || '',
  });

  const parseCurrentInput = async (): Promise<ParsedTransaction | null> => {
    const requestId = ++parseRequestRef.current;
    setIsParsing(true);
    try {
      const parsed = await smsService.parseTransactionMessageAsync({
        id: item.deviceSourceId,
        address: senderAddress,
        body: rawText,
        date: item.inputDate,
      });
      if (!mountedRef.current || parseRequestRef.current !== requestId) return null;
      setParsedResult(parsed);
      setLastParsedSource({ rawText, senderAddress });
      return parsed;
    } catch (error) {
      if (mountedRef.current && parseRequestRef.current === requestId) {
        showErrorAlert(error, 'SMS Parsing', true);
      }
      return null;
    } finally {
      if (mountedRef.current && parseRequestRef.current === requestId) {
        setIsParsing(false);
      }
    }
  };

  const handleReparse = async () => {
    await parseCurrentInput();
  };

  const handleApplyAndImport = async () => {
    let finalParsed = parsedResult;
    const isDirtyFromLastParse =
      !lastParsedSource ||
      rawText !== lastParsedSource.rawText ||
      senderAddress !== lastParsedSource.senderAddress;

    if (!finalParsed || isDirtyFromLastParse) {
      finalParsed = await parseCurrentInput();
      if (!finalParsed || !mountedRef.current) {
        return;
      }
    }

    const sourceWasEdited = rawText !== initialRaw || senderAddress !== initialSender;
    const updatedItem: TransactionInboxItem = {
      ...item,
      rawBody: rawText,
      senderAddress,
      parsedAmount: sourceWasEdited
        ? finalParsed.amount
        : (finalParsed.amount ?? item.parsedAmount),
      parsedCurrencyCode: sourceWasEdited
        ? finalParsed.currencyCode
        : (finalParsed.currencyCode ?? item.parsedCurrencyCode),
      parsedMerchant: sourceWasEdited
        ? finalParsed.merchant
        : (finalParsed.merchant ?? item.parsedMerchant),
      parsedAccountSource: sourceWasEdited
        ? finalParsed.accountSource
        : (finalParsed.accountSource ?? item.parsedAccountSource),
      referenceNumber: sourceWasEdited
        ? finalParsed.referenceNumber
        : (finalParsed.referenceNumber ?? item.referenceNumber),
      direction:
        finalParsed.type === 'credit'
          ? 'credit'
          : finalParsed.type === 'debit'
            ? 'debit'
            : sourceWasEdited
              ? 'unknown'
              : item.direction,
      parseConfidence: finalParsed.confidence,
      parseReason: finalParsed.parseReason,
    };
    afterDismiss.run(() => onImportParsed(updatedItem));
    onClose();
  };

  return (
    <BulkActionModalSurface
      visible={visible}
      title="Edit & Re-Parse Message"
      onClose={() => {
        afterDismiss.cancel();
        onClose();
      }}
      onDismiss={() => {
        afterDismiss.onDismiss();
        onDismiss?.();
      }}
      confirmLabel="Import with Parsed Details"
      onConfirm={handleApplyAndImport}
      isSubmitting={isParsing}
      testID="edit-reparse"
    >
      <View style={styles.content}>
        <AppInput
          label="Sender Address"
          value={senderAddress}
          onChangeText={setSenderAddress}
          placeholder="e.g. HDFCBK, AxisBank"
          testID="edit-reparse-sender-input"
        />

        <AppInput
          label="Message Body"
          value={rawText}
          onChangeText={setRawText}
          multiline
          numberOfLines={4}
          placeholder="Paste or edit the SMS body here..."
          testID="edit-reparse-body-input"
        />

        <AppButton
          variant="secondary"
          size="sm"
          onPress={handleReparse}
          loading={isParsing}
          testID="edit-reparse-trigger-btn"
        >
          Re-Parse Text
        </AppButton>

        {parsedResult && (
          <AppCard
            style={[
              styles.parsedCard,
              { borderColor: theme.border, borderWidth: BorderWidth.thin },
            ]}
            padding="lg"
          >
            <View style={styles.cardHeader}>
              <AppIcon name={Icon.Zap} size={Size.iconXs} color={theme.primary} />
              <AppText variant="caption" weight="bold" color="primary">
                PARSER OUTPUT
              </AppText>
              <Badge size="sm">
                {Math.round((parsedResult.confidence ?? 0) * 100)}% Confidence
              </Badge>
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.merchantColumn}>
                <AppText variant="caption" color="secondary">
                  Merchant
                </AppText>
                <AppText variant="body" weight="semibold">
                  {parsedResult.merchant || 'None detected'}
                </AppText>
              </View>
              <View style={styles.amountColumn}>
                <AppText variant="caption" color="secondary">
                  Amount
                </AppText>
                {parsedResult.amount != null ? (
                  <MoneyText
                    amount={parsedResult.amount}
                    currencyCode={parsedResult.currencyCode || defaultCurrencyCode}
                    prefix={signPrefix(bankEntrySign(parsedResult.type)) || undefined}
                    variant="body"
                    weight="bold"
                    style={{
                      color: theme[signColorKey(bankEntrySign(parsedResult.type))],
                    }}
                  />
                ) : (
                  <AppText variant="body" color="secondary">
                    None
                  </AppText>
                )}
              </View>
            </View>

            {parsedResult.referenceNumber ? (
              <View style={styles.fieldRow}>
                <View>
                  <AppText variant="caption" color="secondary">
                    Reference Number
                  </AppText>
                  <AppText variant="caption" weight="semibold">
                    {parsedResult.referenceNumber}
                  </AppText>
                </View>
              </View>
            ) : null}

            {parsedResult.parseReason ? (
              <AppText variant="caption" color="secondary">
                {parsedResult.parseReason}
              </AppText>
            ) : null}
          </AppCard>
        )}
      </View>
    </BulkActionModalSurface>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.md,
  },
  parsedCard: {
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  merchantColumn: {
    flex: 1,
  },
  amountColumn: {
    alignItems: 'flex-end',
  },
});
