import { Icon, type ListRowItem } from '@/src/components/core';
import { transactionCaptureStrings as copy } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { InboxProcessingStatus } from '@/src/types/enums';
import type { TransactionInboxItem } from '@/src/types/domainJournal';
import { alert, showErrorAlert } from '@/src/utils/alerts';

export type InboxItemActionHandlers = {
  handleDismiss: (item: TransactionInboxItem) => Promise<void>;
  handleUndismiss: (item: TransactionInboxItem) => Promise<void>;
  handleImport: (item: TransactionInboxItem) => void;
  onCompareDuplicate: (item: TransactionInboxItem) => void;
  onOpenJournal: (item: TransactionInboxItem) => void;
  onSplitImport: (item: TransactionInboxItem) => void;
  onEditReparse: (item: TransactionInboxItem) => void;
};

export type InboxItemActions = {
  primary: ListRowItem;
  more: ListRowItem[];
  split: ListRowItem | undefined;
  runAction: (fn: (item: TransactionInboxItem) => unknown) => () => void;
};

/** Primary / more / split action palette for one inbox card. */
export function useInboxItemActions(
  item: TransactionInboxItem,
  handlers: InboxItemActionHandlers,
  options?: { onBeforeAction?: () => void },
): InboxItemActions {
  const privateMode = useEffectivePrivacyMode();
  const linkedJournalUnavailable =
    item.linkedJournal?.status === 'DELETED' || item.linkedJournal?.status === 'MISSING';
  const dismissed = item.processingStatus === InboxProcessingStatus.DISMISSED;
  const sms = item.channel === 'sms';
  const id = item.deviceSourceId;

  const runAction = (fn: (item: TransactionInboxItem) => unknown) => () => {
    options?.onBeforeAction?.();
    void Promise.resolve(fn(item)).catch(error =>
      showErrorAlert(error, copy.inboxActionErrorTitle, true),
    );
  };

  // ponytail: first applicable action is the primary button; the rest go in the More sheet.
  const actions = (
    [
      item.linkedJournal &&
        !linkedJournalUnavailable && {
          id: 'open',
          title: copy.inboxActionOpenJournal,
          icon: Icon.Document,
          onPress: runAction(handlers.onOpenJournal),
        },
      dismissed && {
        id: 'undo',
        title: copy.inboxActionUndoDismiss,
        icon: Icon.History,
        onPress: runAction(handlers.handleUndismiss),
      },
      !item.linkedJournal &&
        item.duplicateCandidate && {
          id: 'compare',
          title: copy.inboxActionCompareDuplicate,
          icon: Icon.Merge,
          onPress: runAction(handlers.onCompareDuplicate),
          testID: `inbox-compare-duplicate-${id}`,
        },
      !item.linkedJournal &&
        (item.processingStatus !== InboxProcessingStatus.PARSE_FAILED ||
          item.channel === 'email') && {
          id: 'import',
          title: copy.inboxActionImportReview,
          icon: Icon.Check,
          onPress: runAction(handlers.handleImport),
        },
      sms &&
        !item.linkedJournal && {
          id: 'reparse',
          title: copy.inboxActionEditReparse,
          icon: Icon.Edit,
          onPress: runAction(handlers.onEditReparse),
          testID: `inbox-edit-reparse-btn-${id}`,
        },
      !item.linkedJournal &&
        !!item.parsedAmount && {
          id: 'split',
          title: copy.inboxActionSplit,
          icon: Icon.SwapHorizontal,
          onPress: runAction(handlers.onSplitImport),
          testID: `inbox-split-btn-${id}`,
        },
      !dismissed && {
        id: 'dismiss',
        title: copy.inboxActionDismiss,
        icon: Icon.X,
        onPress: runAction(handlers.handleDismiss),
      },
      !privateMode &&
        item.channel !== 'email' && {
          id: 'raw',
          title: copy.inboxActionViewRaw,
          icon: Icon.MessageSquare,
          onPress: runAction(() =>
            alert.show({
              title:
                item.channel === 'voice'
                  ? copy.inboxRawVoiceTitle
                  : item.senderAddress || copy.inboxRawMessageTitle,
              message: item.rawBody || '',
            }),
          ),
        },
    ] as (ListRowItem | false | null | undefined)[]
  ).filter((action): action is ListRowItem => Boolean(action));

  const [primaryCandidate, ...more] = actions;
  const primary =
    primaryCandidate ??
    ({
      id: 'dismiss',
      title: copy.inboxActionDismiss,
      icon: Icon.X,
      onPress: runAction(handlers.handleDismiss),
    } satisfies ListRowItem);
  const split = primary.id === 'import' ? more.find(action => action.id === 'split') : undefined;

  return {
    primary,
    more: primaryCandidate ? more : [],
    split,
    runAction,
  };
}
