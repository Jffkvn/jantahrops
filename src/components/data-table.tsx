import type { ReactNode } from 'react';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string | number;
  emptyState?: ReactNode;
}

export function DataTable<T>({ data, columns, keyExtractor, emptyState }: DataTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-sunken">
            {columns.map((col, idx) => (
              <th
                key={idx}
                className={`px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-wider text-ink-secondary ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                } ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((item) => (
            <tr key={keyExtractor(item)} className="transition-colors hover:bg-surface-sunken">
              {columns.map((col, idx) => (
                <td
                  key={idx}
                  className={`px-4 py-2.5 text-sm text-ink ${
                    col.align === 'right'
                      ? 'num text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  } ${col.className ?? ''}`}
                >
                  {col.cell
                    ? col.cell(item)
                    : col.accessorKey
                      ? String(item[col.accessorKey] ?? '')
                      : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
