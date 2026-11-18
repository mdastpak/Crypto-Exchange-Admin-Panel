import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  className?: string
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: string
  empty?: string
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  onRowClick?: (row: T) => void
}

/** A plain table with loading, empty, error, and "load more" states. Cursors stay opaque. */
export function DataTable<T>(p: Props<T>) {
  const { t } = useTranslation()
  return (
    <div className='grid gap-3'>
      <div className='overflow-x-auto rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>{p.columns.map((c) => <TableHead key={c.key} className={c.className}>{c.header}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {p.loading ? (
              Array.from({ length: 4 }, (_, i) => (
                <TableRow key={i}>{p.columns.map((c) => <TableCell key={c.key}><Skeleton className='h-5 w-full' /></TableCell>)}</TableRow>
              ))
            ) : p.error ? (
              <TableRow><TableCell colSpan={p.columns.length} className='py-8 text-center text-destructive' role='alert'>{p.error}</TableCell></TableRow>
            ) : p.rows.length === 0 ? (
              <TableRow><TableCell colSpan={p.columns.length} className='py-8 text-center text-muted-foreground'>{p.empty ?? t('empty')}</TableCell></TableRow>
            ) : (
              p.rows.map((r) => (
                <TableRow key={p.rowKey(r)} className={cn(p.onRowClick && 'cursor-pointer')} onClick={() => p.onRowClick?.(r)}>
                  {p.columns.map((c) => <TableCell key={c.key} className={c.className}>{c.cell(r)}</TableCell>)}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {p.hasMore && (
        <div className='flex justify-center'>
          <Button variant='outline' disabled={p.loadingMore} onClick={p.onLoadMore}>{t('loadMore')}</Button>
        </div>
      )}
    </div>
  )
}
