/**
 * Virtual Scrolling Components
 * ============================
 * Reusable components for rendering large lists efficiently.
 * Only visible items are rendered, dramatically improving performance
 * for lists with 100+ items.
 *
 * Usage:
 *   import { VirtualTable, VirtualList, VirtualGrid } from '@/components/virtual';
 */

import React, { memo, useRef, useEffect, CSSProperties } from 'react';
import { FixedSizeList, VariableSizeList, areEqual } from 'react-window';

// ============================================================================
// Types
// ============================================================================

export interface VirtualTableColumn<T> {
  key: keyof T | string;
  header: string;
  width?: number | string;
  minWidth?: number;
  render?: (item: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

export interface VirtualTableProps<T> {
  /** Data array to render */
  data: T[];
  /** Column definitions */
  columns: VirtualTableColumn<T>[];
  /** Height of each row in pixels */
  rowHeight?: number;
  /** Height of header in pixels */
  headerHeight?: number;
  /** Unique key for each row */
  rowKey: keyof T | ((item: T, index: number) => string);
  /** Callback when row is clicked */
  onRowClick?: (item: T, index: number) => void;
  /** Custom row styles */
  rowStyle?: CSSProperties | ((item: T, index: number) => CSSProperties);
  /** Loading state */
  loading?: boolean;
  /** Empty state message */
  emptyMessage?: string;
  /** Container height (default: 600px) */
  height?: number;
  /** Overscan count for smoother scrolling */
  overscanCount?: number;
  /** Custom class for container */
  className?: string;
  /** Threshold to enable virtualization (default: 50) */
  virtualizationThreshold?: number;
}

export interface VirtualListProps<T> {
  /** Data array to render */
  data: T[];
  /** Render function for each item */
  renderItem: (item: T, index: number, style: CSSProperties) => React.ReactNode;
  /** Height of each item in pixels (for fixed size) */
  itemHeight?: number;
  /** Get height for variable size items */
  getItemHeight?: (index: number) => number;
  /** Unique key for each item */
  itemKey: keyof T | ((item: T, index: number) => string);
  /** Container height (default: 400px) */
  height?: number;
  /** Overscan count */
  overscanCount?: number;
  /** Loading state */
  loading?: boolean;
  /** Empty message */
  emptyMessage?: string;
  /** Virtualization threshold */
  virtualizationThreshold?: number;
}

// ============================================================================
// Helper Components
// ============================================================================

const LoadingOverlay: React.FC = () => (
  <div style={{
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 10,
  }}>
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    color: '#6B7280',
    fontSize: '14px',
  }}>
    {message}
  </div>
);

// ============================================================================
// Virtual Table Component
// ============================================================================

interface RowData<T> {
  data: T[];
  columns: VirtualTableColumn<T>[];
  rowKey: keyof T | ((item: T, index: number) => string);
  onRowClick?: (item: T, index: number) => void;
  rowStyle?: CSSProperties | ((item: T, index: number) => CSSProperties);
}

const TableRow = memo(<T extends object>({ 
  index, 
  style, 
  data: rowData 
}: { 
  index: number; 
  style: CSSProperties; 
  data: RowData<T> 
}) => {
  const { data, columns, rowKey, onRowClick, rowStyle } = rowData;
  const item = data[index];
  
  if (!item) return null;

  const key = typeof rowKey === 'function' 
    ? rowKey(item, index) 
    : String(item[rowKey]);

  const customStyle = typeof rowStyle === 'function' 
    ? rowStyle(item, index) 
    : rowStyle;

  return (
    <div
      key={key}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid #E5E7EB',
        cursor: onRowClick ? 'pointer' : 'default',
        backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F9FAFB',
        ...customStyle,
      }}
      onClick={() => onRowClick?.(item, index)}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#EFF6FF';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
      }}
    >
      {columns.map((column) => {
        const keyStr = String(column.key);
        const value = keyStr.includes('.') 
          ? keyStr.split('.').reduce((obj: any, key: string) => obj?.[key], item)
          : (item as any)[column.key];

        return (
          <div
            key={keyStr}
            style={{
              flex: column.width ? `0 0 ${typeof column.width === 'number' ? `${column.width}px` : column.width}` : 1,
              minWidth: column.minWidth || 80,
              padding: '12px 16px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: column.align || 'left',
              fontSize: '14px',
              color: '#374151',
            }}
          >
            {column.render ? column.render(item, index) : (value ?? '-')}
          </div>
        );
      })}
    </div>
  );
}, areEqual);

TableRow.displayName = 'TableRow';

export function VirtualTable<T extends object>({
  data,
  columns,
  rowHeight = 48,
  headerHeight = 48,
  rowKey,
  onRowClick,
  rowStyle,
  loading = false,
  emptyMessage = 'No data available',
  height = 600,
  overscanCount = 5,
  className = '',
  virtualizationThreshold = 50,
}: VirtualTableProps<T>) {
  const listRef = useRef<FixedSizeList>(null);

  // Reset scroll position when data changes significantly
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo(0);
    }
  }, [data.length > 0 ? (data[0] as any)[rowKey as keyof T] : null]);

  // If data is small, render normally without virtualization
  if (data.length === 0) {
    return (
      <div className={className} style={{ position: 'relative' }}>
        {loading && <LoadingOverlay />}
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  if (data.length < virtualizationThreshold) {
    return (
      <div className={className} style={{ position: 'relative' }}>
        {loading && <LoadingOverlay />}
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          height: headerHeight,
          backgroundColor: '#F3F4F6',
          borderBottom: '2px solid #E5E7EB',
          fontWeight: 600,
          position: 'sticky',
          top: 0,
          zIndex: 5,
        }}>
          {columns.map((column) => (
            <div
              key={String(column.key)}
              style={{
                flex: column.width ? `0 0 ${typeof column.width === 'number' ? `${column.width}px` : column.width}` : 1,
                minWidth: column.minWidth || 80,
                padding: '12px 16px',
                textAlign: column.align || 'left',
                fontSize: '14px',
                color: '#374151',
              }}
            >
              {column.header}
            </div>
          ))}
        </div>
        {/* Body */}
        <div style={{ maxHeight: height - headerHeight, overflow: 'auto' }}>
          {data.map((item, index) => {
            const key = typeof rowKey === 'function' 
              ? rowKey(item, index) 
              : String(item[rowKey]);
            const customStyle = typeof rowStyle === 'function' 
              ? rowStyle(item, index) 
              : rowStyle;

            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: rowHeight,
                  borderBottom: '1px solid #E5E7EB',
                  cursor: onRowClick ? 'pointer' : 'default',
                  backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F9FAFB',
                  ...customStyle,
                }}
                onClick={() => onRowClick?.(item, index)}
              >
                {columns.map((column) => {
                  const keyStr = String(column.key);
                  const value = keyStr.includes('.') 
                    ? keyStr.split('.').reduce((obj: any, key: string) => obj?.[key], item)
                    : (item as any)[column.key];

                  return (
                    <div
                      key={keyStr}
                      style={{
                        flex: column.width ? `0 0 ${typeof column.width === 'number' ? `${column.width}px` : column.width}` : 1,
                        minWidth: column.minWidth || 80,
                        padding: '12px 16px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: column.align || 'left',
                        fontSize: '14px',
                        color: '#374151',
                      }}
                    >
                      {column.render ? column.render(item, index) : (value ?? '-')}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Virtual scrolling for large datasets
  const rowData: RowData<T> = {
    data,
    columns,
    rowKey,
    onRowClick,
    rowStyle,
  };

  return (
    <div className={className} style={{ position: 'relative', height }}>
      {loading && <LoadingOverlay />}
      
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: headerHeight,
        backgroundColor: '#F3F4F6',
        borderBottom: '2px solid #E5E7EB',
        fontWeight: 600,
      }}>
        {columns.map((column) => (
          <div
            key={String(column.key)}
            style={{
              flex: column.width ? `0 0 ${typeof column.width === 'number' ? `${column.width}px` : column.width}` : 1,
              minWidth: column.minWidth || 80,
              padding: '12px 16px',
              textAlign: column.align || 'left',
              fontSize: '14px',
              color: '#374151',
            }}
          >
            {column.header}
          </div>
        ))}
      </div>

      {/* Virtual Body */}
      <FixedSizeList
        ref={listRef}
        height={height - headerHeight}
        itemCount={data.length}
        itemSize={rowHeight}
        width="100%"
        overscanCount={overscanCount}
        itemData={rowData}
      >
        {TableRow as any}
      </FixedSizeList>
    </div>
  );
}

// ============================================================================
// Virtual List Component (for cards/custom items)
// ============================================================================

interface ListItemData<T> {
  data: T[];
  renderItem: (item: T, index: number, style: CSSProperties) => React.ReactNode;
  itemKey: keyof T | ((item: T, index: number) => string);
}

const ListItem = memo(<T extends object>({
  index,
  style,
  data: itemData,
}: {
  index: number;
  style: CSSProperties;
  data: ListItemData<T>;
}) => {
  const { data, renderItem, itemKey } = itemData;
  const item = data[index];
  
  if (!item) return null;

  const key = typeof itemKey === 'function'
    ? itemKey(item, index)
    : String(item[itemKey]);

  return (
    <div key={key} style={style}>
      {renderItem(item, index, style)}
    </div>
  );
}, areEqual);

ListItem.displayName = 'ListItem';

export function VirtualList<T extends object>({
  data,
  renderItem,
  itemHeight = 60,
  getItemHeight,
  itemKey,
  height = 400,
  overscanCount = 5,
  loading = false,
  emptyMessage = 'No items',
  virtualizationThreshold = 50,
}: VirtualListProps<T>) {
  const listRef = useRef<FixedSizeList | VariableSizeList>(null);
  const variableSizeRef = useRef<VariableSizeList>(null);

  // Reset sizes when data changes (for variable size)
  useEffect(() => {
    if (variableSizeRef.current && getItemHeight) {
      variableSizeRef.current.resetAfterIndex(0);
    }
  }, [data, getItemHeight]);

  if (data.length === 0) {
    return (
      <div style={{ position: 'relative', height }}>
        {loading && <LoadingOverlay />}
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  // For small datasets, render normally
  if (data.length < virtualizationThreshold) {
    return (
      <div style={{ position: 'relative', maxHeight: height, overflow: 'auto' }}>
        {loading && <LoadingOverlay />}
        {data.map((item, index) => {
          const key = typeof itemKey === 'function'
            ? itemKey(item, index)
            : String(item[itemKey]);
          return (
            <div key={key}>
              {renderItem(item, index, {})}
            </div>
          );
        })}
      </div>
    );
  }

  const itemData: ListItemData<T> = {
    data,
    renderItem,
    itemKey,
  };

  // Variable size list
  if (getItemHeight) {
    return (
      <div style={{ position: 'relative', height }}>
        {loading && <LoadingOverlay />}
        <VariableSizeList
          ref={variableSizeRef}
          height={height}
          itemCount={data.length}
          itemSize={getItemHeight}
          width="100%"
          overscanCount={overscanCount}
          itemData={itemData}
        >
          {ListItem as any}
        </VariableSizeList>
      </div>
    );
  }

  // Fixed size list
  return (
    <div style={{ position: 'relative', height }}>
      {loading && <LoadingOverlay />}
      <FixedSizeList
        ref={listRef as any}
        height={height}
        itemCount={data.length}
        itemSize={itemHeight}
        width="100%"
        overscanCount={overscanCount}
        itemData={itemData}
      >
        {ListItem as any}
      </FixedSizeList>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default {
  VirtualTable,
  VirtualList,
};
