import { createSignal, createMemo, For, onMount, onCleanup } from 'solid-js';

interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: string;
  sortable?: boolean;
  render?: (row: T) => string | number;
}

interface VirtualTableProps<T extends Record<string, unknown>> {
  data: T[];
  columns: Column<T>[];
  rowHeight?: number;
  visibleRows?: number;
  sortable?: boolean;
}

export default function VirtualTable<T extends Record<string, unknown>>(props: VirtualTableProps<T>) {
  const rowHeight = () => props.rowHeight ?? 40;
  const visibleRows = () => props.visibleRows ?? 15;
  const containerHeight = () => visibleRows() * rowHeight();

  const [scrollTop, setScrollTop] = createSignal(0);
  const [sortKey, setSortKey] = createSignal<string | null>(null);
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('asc');

  let containerRef: HTMLDivElement | undefined;

  const sortedData = createMemo(() => {
    if (!sortKey() || !props.sortable) return props.data;
    const key = sortKey()!;
    const dir = sortDir();
    return [...props.data].sort((a, b) => {
      const av = a[key] as number | string;
      const bv = b[key] as number | string;
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av;
      }
      return dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  });

  const totalHeight = createMemo(() => sortedData().length * rowHeight());

  const startIndex = createMemo(() =>
    Math.max(0, Math.floor(scrollTop() / rowHeight()) - 2)
  );

  const endIndex = createMemo(() =>
    Math.min(
      sortedData().length,
      Math.ceil((scrollTop() + containerHeight()) / rowHeight()) + 2
    )
  );

  const visibleData = createMemo(() =>
    sortedData().slice(startIndex(), endIndex())
  );

  const offsetY = createMemo(() => startIndex() * rowHeight());

  function handleScroll() {
    if (containerRef) {
      setScrollTop(containerRef.scrollTop);
    }
  }

  function handleSort(key: string) {
    if (!props.sortable) return;
    if (sortKey() === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  onMount(() => {
    if (containerRef) {
      containerRef.addEventListener('scroll', handleScroll);
    }
  });

  onCleanup(() => {
    if (containerRef) {
      containerRef.removeEventListener('scroll', handleScroll);
    }
  });

  return (
    <div class="virtual-table-wrap">
      <table class="data-table virtual-table-header">
        <thead>
          <tr>
            <For each={props.columns}>
              {(col) => (
                <th
                  style={{ width: col.width }}
                  class={props.sortable && col.sortable ? 'sortable' : ''}
                  onClick={() => col.sortable && handleSort(String(col.key))}
                >
                  {col.header}
                  {sortKey() === col.key && (
                    <span class="sort-indicator">{sortDir() === 'asc' ? ' ▲' : ' ▼'}</span>
                  )}
                </th>
              )}
            </For>
          </tr>
        </thead>
      </table>
      <div
        ref={containerRef}
        class="virtual-table-body"
        style={{ height: `${containerHeight()}px`, overflow: 'auto' }}
      >
        <div style={{ height: `${totalHeight()}px`, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY()}px)` }}>
            <table class="data-table">
              <tbody>
                <For each={visibleData()}>
                  {(row, index) => (
                    <tr style={{ height: `${rowHeight()}px` }}>
                      <For each={props.columns}>
                        {(col) => (
                          <td>
                            {col.render
                              ? col.render(row)
                              : String(row[col.key as keyof T] ?? '')}
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
