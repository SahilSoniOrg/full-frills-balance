import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppButton, AppCard, AppIcon, AppInput, AppText, Badge } from '@/src/components/core';
import { MoneyText } from '@/src/components/common/MoneyText';
import { ModalSurface } from '@/src/components/common/ModalSurface';
import { Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { smsService } from '@/src/services/sms-service';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { InboxParseStatus } from '@/src/data/models/TransactionInboxRecord';
import { TransactionInboxItem } from '@/src/types/domain';
import { showErrorAlert } from '@/src/utils/alerts';

interface EditReparseSmsModalProps {
  visible: boolean;
  item: TransactionInboxItem | null;
  defaultCurrencyCode: string;
  onClose: () => void;
  onImportParsed: (item: TransactionInboxItem) => void;
}

export function EditReparseSmsModal({
  visible,
  item,
  defaultCurrencyCode,
  onClose,
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
      onImportParsed={onImportParsed}
    />
  );
}

interface EditReparseModalContentProps {
  visible: boolean;
  item: TransactionInboxItem;
  defaultCurrencyCode: string;
  onClose: () => void;
  onImportParsed: (item: TransactionInboxItem) => void;
}

function EditReparseModalContent({
  visible,
  item,
  defaultCurrencyCode,
  onClose,
  onImportParsed,
}: EditReparseModalContentProps) {
  const { theme } = useTheme();
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
    setIsParsing(true);
    try {
      const parsed = await smsService.parseTransactionMessageAsync({
        id: item.deviceSourceId,
        address: senderAddress,
        body: rawText,
        date: item.inputDate,
      });
      setParsedResult(parsed);
      setLastParsedSource({ rawText, senderAddress });
      return parsed;
    } catch (error) {
      showErrorAlert(error, 'SMS Parsing', true);
      return null;
    } finally {
      setIsParsing(false);
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
      if (!finalParsed) {
        return;
      }
    }

    const updatedItem: TransactionInboxItem = {
      ...item,
      rawBody: rawText,
      senderAddress,
      parsedAmount: finalParsed?.amount ?? item.parsedAmount,
      parsedCurrencyCode: finalParsed?.currencyCode ?? item.parsedCurrencyCode,
      parsedMerchant: finalParsed?.merchant ?? item.parsedMerchant,
      parsedAccountSource: finalParsed?.accountSource ?? item.parsedAccountSource,
      referenceNumber: finalParsed?.referenceNumber ?? item.referenceNumber,
      direction:
        finalParsed?.type === 'credit'
          ? 'credit'
          : finalParsed?.type === 'debit'
            ? 'debit'
            : item.direction,
      parseConfidence: finalParsed?.confidence ?? item.parseConfidence,
      parseReason: finalParsed?.parseReason ?? item.parseReason,
    };
    onClose();
    onImportParsed(updatedItem);
  };

  return (
    <ModalSurface
      visible={visible}
      title="Edit & Re-Parse Message"
      onClose={onClose}
      accessibilityCloseLabel="Close edit reparse modal"
      maxHeightPercent={90}
      fixedHeight={false}
      footer={
        <View style={styles.footer}>
          <AppButton
            variant="primary"
            size="md"
            onPress={handleApplyAndImport}
            loading={isParsing}
            testID="edit-reparse-import-btn"
          >
            Import with Parsed Details
          </AppButton>
          <AppButton variant="ghost" size="sm" onPress={onClose}>
            Cancel
          </AppButton>
        </View>
      }
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
            style={[styles.parsedCard, { borderColor: theme.border, borderWidth: 1 }]}
            paddingSize="md"
          >
            <View style={styles.cardHeader}>
              <AppIcon name="zap" size={14} color={theme.primary} />
              <AppText variant="caption" weight="bold" color="primary">
                PARSER OUTPUT
              </AppText>
              <Badge size="sm">
                {Math.round((parsedResult.confidence ?? 0) * 100)}% Confidence
              </Badge>
            </View>

            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color="secondary">
                  Merchant
                </AppText>
                <AppText variant="body" weight="semibold">
                  {parsedResult.merchant || 'None detected'}
                </AppText>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <AppText variant="caption" color="secondary">
                  Amount
                </AppText>
                {parsedResult.amount != null ? (
                  <MoneyText
                    amount={parsedResult.amount}
                    currencyCode={parsedResult.currencyCode || defaultCurrencyCode}
                    prefix={parsedResult.type === 'credit' ? '+ ' : '- '}
                    variant="body"
                    weight="bold"
                    style={{
                      color: parsedResult.type === 'credit' ? theme.success : theme.text,
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
    </ModalSurface>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.md,
  },
  footer: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
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
});
