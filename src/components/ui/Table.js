import React, { forwardRef } from 'react';

/**
 * Table - Unified table component for Acme Operations
 *
 * Design System Compliant:
 * - Consistent styling across all tables
 * - Responsive with horizontal scroll
 * - Striped, hoverable, and bordered variants
 * - Sticky header support
 *
 * @param {string} variant - 'default' | 'striped' | 'bordered'
 * @param {boolean} hoverable - Add hover effect to rows
 * @param {boolean} compact - Reduce padding
 * @param {boolean} stickyHeader - Make header sticky
 * @param {string} className - Additional classes
 */
const Table = forwardRef(({
  variant = 'default',
  hoverable = true,
  compact = false,
  stickyHeader = false,
  children,
  className = '',
  ...props
}, ref) => {
  const variantStyles = {
    default: '',
    striped: '[&_tbody_tr:nth-child(even)]:bg-neutral-50',
    bordered: 'border border-neutral-200 [&_th]:border [&_th]:border-neutral-200 [&_td]:border [&_td]:border-neutral-200',
  };

  const tableStyles = `
    w-full
    text-sm text-left
    ${variantStyles[variant]}
    ${hoverable ? '[&_tbody_tr]:hover:bg-neutral-50 [&_tbody_tr]:transition-colors' : ''}
  `.replace(/\s+/g, ' ').trim();

  return (
    <div className={`overflow-x-auto rounded-lg border border-neutral-200 ${className}`} {...props}>
      <table ref={ref} className={tableStyles}>
        {children}
      </table>
    </div>
  );
});

Table.displayName = 'Table';

/**
 * TableHeader - Table header section
 */
export const TableHeader = forwardRef(({
  sticky = false,
  children,
  className = '',
  ...props
}, ref) => {
  return (
    <thead
      ref={ref}
      className={`
        bg-neutral-50 text-neutral-600 uppercase text-xs tracking-wider
        ${sticky ? 'sticky top-0 z-10' : ''}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </thead>
  );
});

TableHeader.displayName = 'TableHeader';

/**
 * TableBody - Table body section
 */
export const TableBody = forwardRef(({
  children,
  className = '',
  loading = false,
  emptyState,
  ...props
}, ref) => {
  if (loading) {
    return (
      <tbody ref={ref} className={className} {...props}>
        {[...Array(5)].map((_, i) => (
          <tr key={i}>
            <td colSpan={100} className="px-4 py-3">
              <div className="animate-pulse flex space-x-4">
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-neutral-200 rounded w-3/4"></div>
                </div>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    );
  }

  if (React.Children.count(children) === 0 && emptyState) {
    return (
      <tbody ref={ref} className={className} {...props}>
        <tr>
          <td colSpan={100} className="px-4 py-12 text-center">
            {emptyState}
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody
      ref={ref}
      className={`divide-y divide-neutral-100 bg-white ${className}`}
      {...props}
    >
      {children}
    </tbody>
  );
});

TableBody.displayName = 'TableBody';

/**
 * TableRow - Table row
 */
export const TableRow = forwardRef(({
  selected = false,
  clickable = false,
  children,
  className = '',
  ...props
}, ref) => {
  return (
    <tr
      ref={ref}
      className={`
        ${selected ? 'bg-primary-50' : ''}
        ${clickable ? 'cursor-pointer' : ''}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </tr>
  );
});

TableRow.displayName = 'TableRow';

/**
 * TableHead - Table header cell
 */
export const TableHead = forwardRef(({
  sortable = false,
  sorted = null, // 'asc' | 'desc' | null
  align = 'left',
  children,
  className = '',
  onClick,
  ...props
}, ref) => {
  const alignStyles = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  const SortIcon = () => {
    if (!sortable) return null;

    return (
      <span className="ml-1 inline-flex flex-col">
        <svg
          className={`h-2.5 w-2.5 -mb-0.5 ${sorted === 'asc' ? 'text-primary-500' : 'text-neutral-300'}`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 5l-8 8h16z" />
        </svg>
        <svg
          className={`h-2.5 w-2.5 ${sorted === 'desc' ? 'text-primary-500' : 'text-neutral-300'}`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 19l8-8H4z" />
        </svg>
      </span>
    );
  };

  return (
    <th
      ref={ref}
      scope="col"
      className={`
        px-4 py-3 font-semibold whitespace-nowrap
        ${alignStyles[align]}
        ${sortable ? 'cursor-pointer select-none hover:bg-neutral-100 transition-colors' : ''}
        ${className}
      `.trim()}
      onClick={sortable ? onClick : undefined}
      {...props}
    >
      <div className="flex items-center">
        {children}
        <SortIcon />
      </div>
    </th>
  );
});

TableHead.displayName = 'TableHead';

/**
 * TableCell - Table data cell
 */
export const TableCell = forwardRef(({
  align = 'left',
  truncate = false,
  children,
  className = '',
  ...props
}, ref) => {
  const alignStyles = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <td
      ref={ref}
      className={`
        px-4 py-3 text-neutral-700
        ${alignStyles[align]}
        ${truncate ? 'max-w-xs truncate' : ''}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </td>
  );
});

TableCell.displayName = 'TableCell';

/**
 * TableFooter - Table footer section
 */
export const TableFooter = forwardRef(({
  children,
  className = '',
  ...props
}, ref) => {
  return (
    <tfoot
      ref={ref}
      className={`bg-neutral-50 border-t border-neutral-200 ${className}`}
      {...props}
    >
      {children}
    </tfoot>
  );
});

TableFooter.displayName = 'TableFooter';

/**
 * TableCaption - Table caption
 */
export const TableCaption = forwardRef(({
  children,
  className = '',
  ...props
}, ref) => {
  return (
    <caption
      ref={ref}
      className={`px-4 py-3 text-sm text-neutral-500 text-left caption-top ${className}`}
      {...props}
    >
      {children}
    </caption>
  );
});

TableCaption.displayName = 'TableCaption';

/**
 * DataTable - Complete table with common features built in
 */
export const DataTable = ({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data available',
  hoverable = true,
  sortable = false,
  sortColumn,
  sortDirection,
  onSort,
  className = '',
  ...props
}) => {
  const handleSort = (column) => {
    if (!sortable || !onSort || !column.sortable) return;

    const newDirection =
      sortColumn === column.key && sortDirection === 'asc'
        ? 'desc'
        : 'asc';

    onSort(column.key, newDirection);
  };

  return (
    <Table hoverable={hoverable} className={className} {...props}>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead
              key={column.key}
              sortable={sortable && column.sortable}
              sorted={sortColumn === column.key ? sortDirection : null}
              align={column.align}
              onClick={() => handleSort(column)}
              style={{ width: column.width }}
            >
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody
        loading={loading}
        emptyState={
          <div className="text-neutral-500">
            <p className="text-lg font-medium mb-1">No results found</p>
            <p className="text-sm">{emptyMessage}</p>
          </div>
        }
      >
        {data.map((row, rowIndex) => (
          <TableRow key={row.id || rowIndex}>
            {columns.map((column) => (
              <TableCell
                key={column.key}
                align={column.align}
                truncate={column.truncate}
              >
                {column.render ? column.render(row[column.key], row) : row[column.key]}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default Table;
