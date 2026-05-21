import { createSignal, createMemo, For, Show } from "solid-js";

interface Column<T> {
    key: keyof T | string;
    header: string;
    width?: string;
    sortable?: boolean;
    render?: (row: T) => string | number;
    searchable?: boolean;
}

interface DataTableProps<T extends Record<string, unknown>> {
    data: T[];
    columns: Column<T>[];
    sortable?: boolean;
    searchable?: boolean;
    pageSize?: number;
    paginated?: boolean;
}

export default function DataTable<T extends Record<string, unknown>>(
    props: DataTableProps<T>,
) {
    const [sortKey, setSortKey] = createSignal<string | null>(null);
    const [sortDir, setSortDir] = createSignal<"asc" | "desc">("asc");
    const [searchQuery, setSearchQuery] = createSignal("");
    const [currentPage, setCurrentPage] = createSignal(1);

    const pageSize = () => props.pageSize ?? 10;
    const paginated = () => props.paginated ?? false;

    const filteredData = createMemo(() => {
        if (!props.searchable || !searchQuery()) return props.data;
        const query = searchQuery().toLowerCase();
        const searchableColumns = props.columns.filter(
            (c) => c.searchable !== false,
        );
        return props.data.filter((row) =>
            searchableColumns.some((col) => {
                const value = row[col.key as keyof T];
                return String(value).toLowerCase().includes(query);
            }),
        );
    });

    const sortedData = createMemo(() => {
        if (!sortKey() || !props.sortable) return filteredData();
        const key = sortKey()!;
        const dir = sortDir();
        return [...filteredData()].sort((a, b) => {
            const av = a[key] as number | string;
            const bv = b[key] as number | string;
            if (typeof av === "number" && typeof bv === "number") {
                return dir === "asc" ? av - bv : bv - av;
            }
            return dir === "asc"
                ? String(av).localeCompare(String(bv))
                : String(bv).localeCompare(String(av));
        });
    });

    const totalPages = createMemo(() =>
        paginated()
            ? Math.max(1, Math.ceil(sortedData().length / pageSize()))
            : 1,
    );

    const pagedData = createMemo(() => {
        if (!paginated()) return sortedData();
        const start = (currentPage() - 1) * pageSize();
        return sortedData().slice(start, start + pageSize());
    });

    function handleSort(key: string) {
        if (!props.sortable) return;
        if (sortKey() === key) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDir("asc");
        }
        setCurrentPage(1);
    }

    function handleSearch(e: Event) {
        const target = e.target as HTMLInputElement;
        setSearchQuery(target.value);
        setCurrentPage(1);
    }

    function goToPage(page: number) {
        const clamped = Math.max(1, Math.min(page, totalPages()));
        setCurrentPage(clamped);
    }

    const pageNumbers = createMemo(() => {
        const total = totalPages();
        const current = currentPage();
        const pages: (number | string)[] = [];

        if (total <= 7) {
            for (let i = 1; i <= total; i++) pages.push(i);
        } else {
            pages.push(1);
            if (current > 3) pages.push("...");
            const start = Math.max(2, current - 1);
            const end = Math.min(total - 1, current + 1);
            for (let i = start; i <= end; i++) pages.push(i);
            if (current < total - 2) pages.push("...");
            pages.push(total);
        }
        return pages;
    });

    return (
        <div class="data-table-wrapper">
            <Show when={props.searchable}>
                <div class="table-toolbar">
                    <div class="table-search">
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.3-4.3" />
                        </svg>
                        <input
                            type="text"
                            placeholder="搜索..."
                            value={searchQuery()}
                            onInput={handleSearch}
                            class="table-search-input"
                        />
                        <Show when={searchQuery()}>
                            <button
                                class="table-search-clear"
                                onClick={() => {
                                    setSearchQuery("");
                                    setCurrentPage(1);
                                }}
                            >
                                <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path d="M18 6 6 18" />
                                    <path d="m6 6 12 12" />
                                </svg>
                            </button>
                        </Show>
                    </div>
                    <div class="table-info">
                        共 {filteredData().length} 条记录
                    </div>
                </div>
            </Show>

            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <For each={props.columns}>
                                {(col) => (
                                    <th
                                        style={{ width: col.width }}
                                        class={
                                            props.sortable && col.sortable
                                                ? "sortable"
                                                : ""
                                        }
                                        onClick={() =>
                                            col.sortable &&
                                            handleSort(String(col.key))
                                        }
                                    >
                                        {col.header}
                                        {sortKey() === col.key && (
                                            <span class="sort-indicator">
                                                {sortDir() === "asc"
                                                    ? " ▲"
                                                    : " ▼"}
                                            </span>
                                        )}
                                    </th>
                                )}
                            </For>
                        </tr>
                    </thead>
                    <tbody>
                        <Show
                            when={pagedData().length > 0}
                            fallback={
                                <tr>
                                    <td
                                        class="table-empty-cell"
                                        colspan={props.columns.length}
                                    >
                                        <div class="table-empty-state">
                                            <div class="table-empty-title">
                                                {searchQuery()
                                                    ? "没有匹配结果"
                                                    : "暂无数据"}
                                            </div>
                                            <div class="table-empty-description">
                                                {searchQuery()
                                                    ? "换个关键词再试"
                                                    : "有数据后会显示在这里"}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            }
                        >
                            <For each={pagedData()}>
                                {(row) => (
                                    <tr>
                                        <For each={props.columns}>
                                            {(col) => (
                                                <td>
                                                    {col.render
                                                        ? col.render(row)
                                                        : String(
                                                              row[
                                                                  col.key as keyof T
                                                              ] ?? "",
                                                          )}
                                                </td>
                                            )}
                                        </For>
                                    </tr>
                                )}
                            </For>
                        </Show>
                    </tbody>
                </table>
            </div>

            <Show when={paginated() && totalPages() > 1}>
                <div class="table-pagination">
                    <button
                        class="page-btn"
                        disabled={currentPage() === 1}
                        onClick={() => goToPage(currentPage() - 1)}
                    >
                        上一页
                    </button>
                    <div class="page-numbers">
                        <For each={pageNumbers()}>
                            {(page) => (
                                <Show
                                    when={typeof page === "number"}
                                    fallback={
                                        <span class="page-ellipsis">...</span>
                                    }
                                >
                                    <button
                                        class="page-number"
                                        classList={{
                                            active: currentPage() === page,
                                        }}
                                        onClick={() => goToPage(page as number)}
                                    >
                                        {page}
                                    </button>
                                </Show>
                            )}
                        </For>
                    </div>
                    <button
                        class="page-btn"
                        disabled={currentPage() === totalPages()}
                        onClick={() => goToPage(currentPage() + 1)}
                    >
                        下一页
                    </button>
                </div>
            </Show>
        </div>
    );
}
