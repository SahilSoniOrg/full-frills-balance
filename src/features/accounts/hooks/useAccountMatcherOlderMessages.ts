import { accountMatcherStrings as copy } from '@/src/constants/copy/domains/accountMatcherStrings';
import {
  readLatestAccountMatcherMessages,
  readOlderAccountMatcherMessages,
} from '@/src/services/accounts/accountMatcherOlderMessages';
import type { AccountMatcherPreviewMessage } from '@/src/services/accounts/accountMatcherPreviewQueries';
import type { WorkplaceId } from '@/src/types/ids';
import type { SmsInboxCursor } from '@/src/types/smsInbox';
import { useCallback, useEffect, useRef, useState } from 'react';

interface OlderMessagesState {
  workplaceId: WorkplaceId;
  messages: AccountMatcherPreviewMessage[];
  loaded: boolean;
  cursor: SmsInboxCursor | null;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

function emptyState(workplaceId: WorkplaceId): OlderMessagesState {
  return {
    workplaceId,
    messages: [],
    loaded: false,
    cursor: null,
    hasMore: false,
    loading: false,
    error: null,
  };
}

/** Pages device SMS for the matcher picker without importing or storing those messages. */
export function useAccountMatcherOlderMessages(workplaceId: WorkplaceId) {
  const [stored, setStored] = useState(() => emptyState(workplaceId));
  const request = useRef(0);
  const state = stored.workplaceId === workplaceId ? stored : emptyState(workplaceId);

  useEffect(() => {
    return () => {
      request.current += 1;
    };
  }, [workplaceId]);

  const loadOlderMessages = useCallback(async () => {
    if (state.loading || (state.loaded && !state.hasMore)) return;
    const requestId = ++request.current;
    setStored({ ...state, loading: true, error: null });
    try {
      const page = state.loaded
        ? state.cursor
          ? await readOlderAccountMatcherMessages(workplaceId, state.cursor)
          : null
        : await readLatestAccountMatcherMessages(workplaceId);
      if (request.current !== requestId) return;
      setStored(current => {
        if (current.workplaceId !== workplaceId) return current;
        if (!page) return { ...current, loading: false };
        const existingIds = new Set(current.messages.map(message => message.id));
        return {
          ...current,
          messages: [
            ...current.messages,
            ...page.messages.filter(message => !existingIds.has(message.id)),
          ],
          loaded: true,
          cursor: page.nextCursor,
          hasMore: page.hasMore,
          loading: false,
        };
      });
    } catch {
      if (request.current !== requestId) return;
      setStored(current =>
        current.workplaceId === workplaceId
          ? { ...current, loading: false, error: copy.olderMessagesError }
          : current,
      );
    }
  }, [state, workplaceId]);

  return {
    olderMessages: state.messages,
    olderMessagesLoaded: state.loaded,
    hasMoreOlderMessages: state.hasMore,
    isLoadingOlderMessages: state.loading,
    olderMessagesError: state.error,
    loadOlderMessages,
  };
}
