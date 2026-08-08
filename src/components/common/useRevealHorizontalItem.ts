import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';

const MAX_SCROLL_ATTEMPTS = 5;
const SCROLL_RETRY_MS = 50;

type UseRevealHorizontalItemOptions = {
  margin?: number;
  estimatedItemWidth?: number;
};

export function useRevealHorizontalItem(
  selectedId: string,
  itemIds: readonly string[],
  { margin = 0, estimatedItemWidth = 140 }: UseRevealHorizontalItemOptions = {},
) {
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const itemRefs = useRef(new Map<string, View>());

  const scrollToId = useCallback(
    (id: string) => {
      if (!id) return false;

      const itemNode = itemRefs.current.get(id);
      const contentNode = contentRef.current;
      if (!itemNode || !contentNode || !scrollRef.current) return false;

      const index = itemIds.indexOf(id);
      const fallbackX = index >= 0 ? index * estimatedItemWidth : 0;

      itemNode.measureLayout(
        contentNode,
        x => {
          scrollRef.current?.scrollTo({
            x: Math.max(0, x - margin),
            animated: true,
          });
        },
        () => {
          scrollRef.current?.scrollTo({
            x: Math.max(0, fallbackX - margin),
            animated: true,
          });
        },
      );
      return true;
    },
    [estimatedItemWidth, itemIds, margin],
  );

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const scroll = () => {
      if (cancelled || attempts >= MAX_SCROLL_ATTEMPTS) return;
      attempts += 1;
      if (!scrollToId(selectedId)) {
        retryTimer = setTimeout(scroll, SCROLL_RETRY_MS);
      }
    };

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(scroll);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [scrollToId, selectedId]);

  const registerItemRef = useCallback((id: string, node: View | null) => {
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  }, []);

  return { scrollRef, contentRef, registerItemRef };
}
