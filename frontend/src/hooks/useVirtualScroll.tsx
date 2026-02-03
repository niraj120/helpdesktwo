/**
 * useVirtualScroll Hook
 * ======================
 * A hook that provides virtual scrolling utilities for any list.
 * Can be used for progressive enhancement - lists work normally
 * but switch to virtual scrolling when item count exceeds threshold.
 *
 * Usage:
 *   const { containerRef, virtualItems, totalHeight, isVirtualized } = useVirtualScroll({
 *     items: myLargeArray,
 *     itemHeight: 48,
 *     threshold: 100,
 *     containerHeight: 600,
 *   });
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

export interface UseVirtualScrollOptions<T> {
  /** The array of items to render */
  items: T[];
  /** Height of each item in pixels (for fixed height) */
  itemHeight: number;
  /** Height of the container in pixels */
  containerHeight: number;
  /** Minimum item count to enable virtualization (default: 100) */
  threshold?: number;
  /** Number of items to render outside visible area (default: 5) */
  overscan?: number;
}

export interface VirtualItem<T> {
  /** The original item data */
  data: T;
  /** The original index in the items array */
  index: number;
  /** Absolute positioning style for this item */
  style: {
    position: 'absolute';
    top: number;
    left: number;
    right: number;
    height: number;
  };
}

export interface UseVirtualScrollResult<T> {
  /** Ref to attach to the scroll container */
  containerRef: React.RefObject<HTMLDivElement>;
  /** The virtual items to render (includes style positioning) */
  virtualItems: VirtualItem<T>[];
  /** Total height of all items (for setting inner container height) */
  totalHeight: number;
  /** Whether virtualization is active */
  isVirtualized: boolean;
  /** Current scroll position */
  scrollTop: number;
  /** Scroll to a specific index */
  scrollToIndex: (index: number, align?: 'start' | 'center' | 'end') => void;
  /** Scroll to top */
  scrollToTop: () => void;
}

export function useVirtualScroll<T>({
  items,
  itemHeight,
  containerHeight,
  threshold = 100,
  overscan = 5,
}: UseVirtualScrollOptions<T>): UseVirtualScrollResult<T> {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  // Determine if we should virtualize
  const isVirtualized = items.length >= threshold;

  // Calculate total height
  const totalHeight = items.length * itemHeight;

  // Handle scroll events
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isVirtualized) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isVirtualized]);

  // Calculate visible items
  const virtualItems = useMemo(() => {
    if (!isVirtualized) {
      // Return all items with their positions
      return items.map((data, index) => ({
        data,
        index,
        style: {
          position: 'absolute' as const,
          top: index * itemHeight,
          left: 0,
          right: 0,
          height: itemHeight,
        },
      }));
    }

    // Calculate visible range
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );

    // Create virtual items for visible range only
    const visibleItems: VirtualItem<T>[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      visibleItems.push({
        data: items[i],
        index: i,
        style: {
          position: 'absolute' as const,
          top: i * itemHeight,
          left: 0,
          right: 0,
          height: itemHeight,
        },
      });
    }

    return visibleItems;
  }, [items, itemHeight, scrollTop, containerHeight, overscan, isVirtualized]);

  // Scroll to index function
  const scrollToIndex = useCallback((index: number, align: 'start' | 'center' | 'end' = 'start') => {
    const container = containerRef.current;
    if (!container) return;

    let targetScrollTop: number;
    switch (align) {
      case 'center':
        targetScrollTop = (index * itemHeight) - (containerHeight / 2) + (itemHeight / 2);
        break;
      case 'end':
        targetScrollTop = (index * itemHeight) - containerHeight + itemHeight;
        break;
      case 'start':
      default:
        targetScrollTop = index * itemHeight;
    }

    container.scrollTo({
      top: Math.max(0, Math.min(targetScrollTop, totalHeight - containerHeight)),
      behavior: 'smooth',
    });
  }, [itemHeight, containerHeight, totalHeight]);

  // Scroll to top function
  const scrollToTop = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return {
    containerRef,
    virtualItems,
    totalHeight,
    isVirtualized,
    scrollTop,
    scrollToIndex,
    scrollToTop,
  };
}

/**
 * Simple Virtual List Wrapper Component
 * For cases where you want a drop-in replacement with minimal changes
 */
interface SimpleVirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  threshold?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  className?: string;
  emptyMessage?: string;
}

export function SimpleVirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  threshold = 100,
  renderItem,
  keyExtractor,
  className = '',
  emptyMessage = 'No items',
}: SimpleVirtualListProps<T>) {
  const {
    containerRef,
    virtualItems,
    totalHeight,
    isVirtualized,
  } = useVirtualScroll({
    items,
    itemHeight,
    containerHeight,
    threshold,
  });

  if (items.length === 0) {
    return (
      <div
        className={className}
        style={{
          height: containerHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#6B7280',
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  // Non-virtualized rendering (below threshold)
  if (!isVirtualized) {
    return (
      <div
        className={className}
        style={{
          height: containerHeight,
          overflow: 'auto',
        }}
      >
        {items.map((item, index) => (
          <div key={keyExtractor(item, index)} style={{ height: itemHeight }}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  // Virtualized rendering
  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative',
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {virtualItems.map(({ data, index, style }) => (
          <div
            key={keyExtractor(data, index)}
            style={{
              ...style,
              boxSizing: 'border-box',
            }}
          >
            {renderItem(data, index)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default useVirtualScroll;
