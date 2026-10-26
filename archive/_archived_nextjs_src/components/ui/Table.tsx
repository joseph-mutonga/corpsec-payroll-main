'use client';

import React from 'react';

export interface Column<T> {
  header: string;
  accessor?: keyof T | ((item: T) => React.ReactNode);
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  isLoading?: boolean;
  emptyText?: string;
  onRowClick?: (item: T) => void;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyText = 'No records found',
  onRowClick,
}: TableProps<T>) {
  return (
    <div className="table-responsive" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            {columns.map((col, idx) => (
              <th
                key={idx}
                style={{
                  padding: '0.75rem 1rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#475569',
                  width: col.width,
                  textAlign: col.align || 'left',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: '2.5rem 1rem',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Loading records...</span>
                </div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: '2.5rem 1rem',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '0.875rem',
                }}
              >
                {emptyText}
              </td>
            </tr>
          ) : (
            data.map((item, rowIdx) => (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                style={{
                  borderBottom: rowIdx === data.length - 1 ? 'none' : '1px solid #f1f5f9',
                  backgroundColor: '#ffffff',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (onRowClick) e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (onRowClick) e.currentTarget.style.backgroundColor = '#ffffff';
                }}
              >
                {columns.map((col, colIdx) => {
                  let content: React.ReactNode = null;
                  if (typeof col.accessor === 'function') {
                    content = col.accessor(item);
                  } else if (col.accessor) {
                    content = (item as any)[col.accessor];
                  }

                  return (
                    <td
                      key={colIdx}
                      style={{
                        padding: '0.875rem 1rem',
                        fontSize: '0.875rem',
                        color: '#1e293b',
                        textAlign: col.align || 'left',
                      }}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
