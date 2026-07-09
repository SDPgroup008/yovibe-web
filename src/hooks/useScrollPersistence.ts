/**
 * React hook for scroll position persistence
 * Automatically saves and restores scroll positions
 */

import { useEffect, useRef } from 'react';
import { scrollPersistence, SCREEN_IDS } from '../utils/scrollPersistence';

interface UseScrollPersistenceOptions {
  screenId: string;
  enabled?: boolean;
  saveDelay?: number; // Delay in ms before saving position (default: 100ms)
}

export function useScrollPersistence(options: UseScrollPersistenceOptions) {
  const { screenId, enabled = true, saveDelay = 100 } = options;
  const scrollRef = useRef<any>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const isRestoredRef = useRef(false);
  const pendingRestoreRef = useRef<{ x: number; y: number } | null>(null);
  const retryCountRef = useRef(0);
  const lastScrollRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const applyScrollPosition = (x: number, y: number) => {
    if (!scrollRef.current) {
      console.log(`[ScrollPersistence:${screenId}] ❌ applyScrollPosition failed - scrollRef.current is NULL`);
      return false;
    }
    
    const ref = scrollRef.current;
    console.log(`[ScrollPersistence:${screenId}] 🎯 applyScrollPosition called with x=${x}, y=${y}`);
    console.log(`[ScrollPersistence:${screenId}] 🔍 scrollRef type:`, ref.constructor?.name);
    console.log(`[ScrollPersistence:${screenId}] 🔍 has scrollTo:`, typeof ref.scrollTo === 'function');
    console.log(`[ScrollPersistence:${screenId}] 🔍 has scrollToY:`, typeof ref.scrollToY === 'function');
    
    // Strategy 1: Standard React Native scrollTo (works on native and some web setups)
    if (typeof ref.scrollTo === 'function') {
      ref.scrollTo({ x, y, animated: false });
      console.log(`[ScrollPersistence:${screenId}] ✅ scrollTo({ x:${x}, y:${y} }) executed successfully`);
      return true;
    }
    
    // Strategy 2: FlatList-specific scrollToOffset (react-native-web)
    if (typeof ref.scrollToOffset === 'function') {
      ref.scrollToOffset({ animated: false, offset: y });
      console.log(`[ScrollPersistence:${screenId}] ✅ scrollToOffset({ offset:${y} }) executed successfully`);
      return true;
    }
    
    // Strategy 3: ScrollView's scrollToY (older React Native)
    if (typeof ref.scrollToY === 'function') {
      ref.scrollToY({ y, animated: false });
      console.log(`[ScrollPersistence:${screenId}] ✅ scrollToY({ y:${y} }) executed successfully`);
      return true;
    }
    
    // Strategy 4: Use the VirtualizedList via findNodeHandle
    if (typeof ref.getScrollResponder === 'function') {
      const scrollResponder = ref.getScrollResponder();
      if (scrollResponder && typeof scrollResponder.scrollTo === 'function') {
        scrollResponder.scrollTo({ x, y, animated: false });
        console.log(`[ScrollPersistence:${screenId}] ✅ getScrollResponder().scrollTo() executed successfully`);
        return true;
      }
    }
    
    // Strategy 5: getScrollableNode for direct DOM access
    if (typeof ref.getScrollableNode === 'function') {
      const node = ref.getScrollableNode();
      if (node && typeof node.scrollTop !== 'undefined') {
        node.scrollTop = y;
        node.scrollLeft = x;
        console.log(`[ScrollPersistence:${screenId}] ✅ getScrollableNode().scrollTop = ${y} done`);
        return true;
      }
    }
    
    // Strategy 6: Internal _listRef (VirtualizedList) or _scrollRef (ScrollView)
    if ((ref as any)._listRef || (ref as any)._scrollRef) {
      const inner = (ref as any)._listRef || (ref as any)._scrollRef;
      if (typeof inner.scrollToOffset === 'function') {
        inner.scrollToOffset({ animated: false, offset: y });
        console.log(`[ScrollPersistence:${screenId}] ✅ inner.scrollToOffset() executed`);
        return true;
      }
      if (typeof inner.scrollTo === 'function') {
        inner.scrollTo({ x, y, animated: false });
        console.log(`[ScrollPersistence:${screenId}] ✅ inner.scrollTo() executed`);
        return true;
      }
      if (typeof inner.scrollTop !== 'undefined') {
        inner.scrollTop = y;
        inner.scrollLeft = x;
        console.log(`[ScrollPersistence:${screenId}] ✅ inner.scrollTop = ${y} done`);
        return true;
      }
    }
    
    // Strategy 7: Direct DOM element (react-native-web attaches scrollable node)
    const maybeDomNode = ref.node?.current || ref._node || ref._scrollNodeRef || ref;
    if (maybeDomNode && maybeDomNode.tagName && typeof maybeDomNode.scrollTop !== 'undefined') {
      maybeDomNode.scrollTop = y;
      maybeDomNode.scrollLeft = x;
      console.log(`[ScrollPersistence:${screenId}] ✅ direct DOM element scrollTop=${y} done`);
      return true;
    }
    
    // Strategy 8: For VirtualizedList, try to find the inner ScrollView in DOM
    if (typeof document !== 'undefined') {
      const scrollViews = document.querySelectorAll('[class*="ScrollView"], [data-testid*="ScrollView"], [class*="css-view"]');
      // Try to find scrollable containers that have overflow:auto or overflow:scroll
      for (const el of scrollViews) {
        const style = window.getComputedStyle(el);
        if ((style.overflow === 'auto' || style.overflow === 'scroll' || 
             style.overflowY === 'auto' || style.overflowY === 'scroll') && 
            el.scrollHeight > el.clientHeight) {
          el.scrollTop = y;
          el.scrollLeft = x;
          console.log(`[ScrollPersistence:${screenId}] ✅ found scrollable DOM element, scrollTop=${y} done`);
          return true;
        }
      }
    }
    
    console.log(`[ScrollPersistence:${screenId}] ❌ ALL scroll strategies failed for ref type ${ref.constructor?.name}`);
    return false;
  };

  const doRestore = (savedPosition: { x: number; y: number } | null) => {
    if (!savedPosition) {
      console.log(`[ScrollPersistence:${screenId}] 📭 doRestore called but no savedPosition`);
      return;
    }
    if (isRestoredRef.current) {
      console.log(`[ScrollPersistence:${screenId}] ⏭️ doRestore skipped - isRestoredRef is already true`);
      return;
    }
    
    const { x, y } = savedPosition;
    console.log(`[ScrollPersistence:${screenId}] 🚀 doRestore starting, target x=${x}, y=${y}`);
    console.log(`[ScrollPersistence:${screenId}] 📊 scrollRef.current exists:`, !!scrollRef.current);
    
    // Try immediately
    if (applyScrollPosition(x, y)) {
      console.log(`[ScrollPersistence:${screenId}] ✅ doRestore succeeded immediately (ref was ready)`);
      isRestoredRef.current = true;
      pendingRestoreRef.current = null;
      return;
    }
    
    console.log(`[ScrollPersistence:${screenId}] ⏳ scrollRef not ready yet, starting retry loop (max 30 attempts)...`);
    
    // Ref wasn't set yet — use requestAnimationFrame chain
    const attemptRestore = () => {
      if (isRestoredRef.current) {
        console.log(`[ScrollPersistence:${screenId}] ⏹️ retry loop stopped - isRestoredRef became true`);
        return;
      }
      retryCountRef.current++;
      console.log(`[ScrollPersistence:${screenId}] 🔄 retry #${retryCountRef.current}: scrollRef exists=${!!scrollRef.current}`);
      
      if (scrollRef.current && applyScrollPosition(x, y)) {
        console.log(`[ScrollPersistence:${screenId}] ✅ retry #${retryCountRef.current} succeeded!`);
        isRestoredRef.current = true;
        pendingRestoreRef.current = null;
        return;
      }
      
      // Keep retrying up to 30 times (approx 3 seconds at 100ms intervals)
      if (retryCountRef.current < 30) {
        setTimeout(attemptRestore, 100);
      } else {
        console.log(`[ScrollPersistence:${screenId}] ❌ retry loop exhausted (30 attempts) - failed to restore`);
      }
    };
    
    // Queue via rAF then start retry loop
    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      console.log(`[ScrollPersistence:${screenId}] 📋 queuing first attempt via requestAnimationFrame`);
      window.requestAnimationFrame(() => {
        attemptRestore();
      });
    } else {
      attemptRestore();
    }
  };

  // On mount: check for saved position and start restore attempts
  useEffect(() => {
    if (!enabled) {
      console.log(`[ScrollPersistence:${screenId}] 🔇 disabled, skipping`);
      return;
    }
    
    retryCountRef.current = 0;
    console.log(`[ScrollPersistence:${screenId}] 📋 MOUNT effect running for screenId=${screenId}`);
    
    const savedPosition = scrollPersistence.getPosition(screenId);
    console.log(`[ScrollPersistence:${screenId}] 🔍 getPosition returned:`, savedPosition ? `{ x:${savedPosition.x}, y:${savedPosition.y}, timestamp:${savedPosition.timestamp} }` : 'null');
    
    if (savedPosition) {
      // There is a saved position — stage it for restoration and start retry loop
      pendingRestoreRef.current = { x: savedPosition.x, y: savedPosition.y };
      console.log(`[ScrollPersistence:${screenId}] 📌 pendingRestoreRef set to x=${savedPosition.x}, y=${savedPosition.y}`);
      doRestore(savedPosition);
    } else {
      // No saved position — this is the FIRST visit or position was cleared.
      // Immediately mark as restored so handleScroll saves future scroll positions.
      console.log(`[ScrollPersistence:${screenId}] ✅ No saved position — marking as restored immediately so saves can start`);
      isRestoredRef.current = true;
    }

    return () => {
      // Flush any pending save before unmount — if the debounce timer hasn't
      // fired yet, save the last known scroll position immediately so it
      // doesn't get lost when navigating away.
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = undefined;
        const { x, y } = lastScrollRef.current;
        if (y > 0 || x > 0) {
          console.log(`[ScrollPersistence:${screenId}] 🧹 CLEANUP - flushing pending save, lastScroll y=${y}`);
          scrollPersistence.savePosition(screenId, y, x);
        } else {
          console.log(`[ScrollPersistence:${screenId}] 🧹 CLEANUP - lastScroll is (0,0), nothing to flush`);
        }
      } else {
        console.log(`[ScrollPersistence:${screenId}] 🧹 CLEANUP - no saveTimeout to flush`);
      }
      console.log(`[ScrollPersistence:${screenId}] 🧹 CLEANUP done`);
    };
  }, [screenId, enabled]);

  const handleScroll = (event: any) => {
    if (!enabled) return;

    // Extract scroll offset from the event
    const { x, y } = event?.nativeEvent?.contentOffset || { x: 0, y: 0 };

    // Always track latest scroll position (used for cleanup flush)
    lastScrollRef.current = { x, y };

    console.log(`[ScrollPersistence:${screenId}] 📜 handleScroll fired, x=${x}, y=${y}, isRestored=${isRestoredRef.current}`);

    // CRITICAL: Do NOT overwrite saved position with 0 before restoration
    // has happened.  FlatList / ScrollView fires onScroll once on mount with
    // y=0, which would clear the position we want to restore to.
    if (!isRestoredRef.current) {
      console.log(`[ScrollPersistence:${screenId}] ⏭️ handleScroll y=${y} IGNORED - not yet restored`);
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      console.log(`[ScrollPersistence:${screenId}] 💾 SAVING position y=${y}, x=${x} for screenId=${screenId}`);
      scrollPersistence.savePosition(screenId, y, x);
    }, saveDelay);
  };

  const handleContentSizeChange = (contentWidth?: number, contentHeight?: number) => {
    console.log(`[ScrollPersistence:${screenId}] 📐 onContentSizeChange fired, width=${contentWidth}, height=${contentHeight}`);
    console.log(`[ScrollPersistence:${screenId}] 📌 pendingRestore=${!!pendingRestoreRef.current}, isRestored=${isRestoredRef.current}`);
    
    // Fallback: if onContentSizeChange fires after mount and we
    // haven't restored yet, try again now that content is laid out
    if (pendingRestoreRef.current && !isRestoredRef.current) {
      const pos = pendingRestoreRef.current;
      console.log(`[ScrollPersistence:${screenId}] 🎯 onContentSizeChange attempting pending restore x=${pos.x}, y=${pos.y}`);
      if (applyScrollPosition(pos.x, pos.y)) {
        console.log(`[ScrollPersistence:${screenId}] ✅ onContentSizeChange restore succeeded`);
        isRestoredRef.current = true;
        pendingRestoreRef.current = null;
      }
    }
  };

  const restorePosition = () => {
    if (!enabled) return;
    
    console.log(`[ScrollPersistence:${screenId}] 🔄 restorePosition() called explicitly`);
    
    const savedPosition = scrollPersistence.getPosition(screenId);
    console.log(`[ScrollPersistence:${screenId}] 🔍 restorePosition getPosition:`, savedPosition ? `{ y:${savedPosition.y}, x:${savedPosition.x} }` : 'null');
    
    if (savedPosition) {
      // Only reset flag when we have something to restore
      isRestoredRef.current = false;
      retryCountRef.current = 0;
      pendingRestoreRef.current = { x: savedPosition.x, y: savedPosition.y };
      console.log(`[ScrollPersistence:${screenId}] 📌 restorePosition set pendingRestoreRef to x=${savedPosition.x}, y=${savedPosition.y}`);
      doRestore(savedPosition);
    } else {
      // No position to restore — leave isRestored as-is so saves continue working
      console.log(`[ScrollPersistence:${screenId}] ⏭️ restorePosition - no saved position, leaving isRestored=${isRestoredRef.current}`);
    }
  };

  return {
    scrollRef,
    onScroll: handleScroll,
    onContentSizeChange: handleContentSizeChange,
    clearPosition: () => scrollPersistence.clearPosition(screenId),
    restorePosition,
    markRestored: () => { isRestoredRef.current = true; }
  };
}

// Pre-configured hooks for common screens
export function useEventsScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.EVENTS });
}

export function useVenuesScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.VENUES });
}

export function useMapScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.MAP });
}

export function useCalendarScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.CALENDAR });
}

export function useProfileScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.PROFILE });
}

export function useMyVenuesScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.MY_VENUES });
}

export function useMyTicketsScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.MY_TICKETS });
}

export function useNotificationsScroll() {
  return useScrollPersistence({ screenId: SCREEN_IDS.NOTIFICATIONS });
}

export function useEventDetailsScroll(eventId: string) {
  return useScrollPersistence({ screenId: SCREEN_IDS.EVENT_DETAILS(eventId) });
}

export function useVenueDetailsScroll(venueId: string) {
  return useScrollPersistence({ screenId: SCREEN_IDS.VENUE_DETAILS(venueId) });
}