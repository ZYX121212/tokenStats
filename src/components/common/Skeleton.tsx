import { For } from "solid-js";

export default function Skeleton(props: {
    rows?: number;
    type?: "default" | "stats" | "card" | "table";
}) {
    const rows = props.rows ?? 3;
    const type = props.type ?? "default";

    if (type === "stats") {
        return (
            <div class="skeleton-stats-grid">
                <For each={Array.from({ length: 4 }, (_, i) => i)}>
                    {(i) => (
                        <div class="skeleton-stat-card skeleton-pulse">
                            <div class="skeleton-stat-label"></div>
                            <div class="skeleton-stat-value"></div>
                            {i === 0 && <div class="skeleton-stat-trend"></div>}
                        </div>
                    )}
                </For>
            </div>
        );
    }

    if (type === "card") {
        return (
            <div class="skeleton-card skeleton-pulse">
                <div class="skeleton-card-header">
                    <div class="skeleton-circle"></div>
                    <div class="skeleton-card-title-group">
                        <div class="skeleton-card-title"></div>
                        <div class="skeleton-card-subtitle"></div>
                    </div>
                </div>
                <div class="skeleton-card-body">
                    <For each={Array.from({ length: rows }, (_, i) => i)}>
                        {(i) => (
                            <div
                                class="skeleton-line"
                                style={{ width: `${60 + i * 15}%` }}
                            ></div>
                        )}
                    </For>
                </div>
            </div>
        );
    }

    if (type === "table") {
        return (
            <div class="skeleton-table">
                <div class="skeleton-table-header">
                    <For each={Array.from({ length: 5 }, (_, i) => i)}>
                        {() => <div class="skeleton-table-cell"></div>}
                    </For>
                </div>
                <For each={Array.from({ length: rows }, (_, i) => i)}>
                    {(rowIndex) => (
                        <div
                            class="skeleton-table-row skeleton-stagger"
                            style={{ "--stagger-delay": `${rowIndex * 0.1}s` }}
                        >
                            <For each={Array.from({ length: 5 }, (_, i) => i)}>
                                {(colIndex) => (
                                    <div
                                        class="skeleton-table-cell"
                                        style={{
                                            width:
                                                colIndex === 0
                                                    ? "25%"
                                                    : colIndex === 4
                                                      ? "15%"
                                                      : "20%",
                                        }}
                                    ></div>
                                )}
                            </For>
                        </div>
                    )}
                </For>
            </div>
        );
    }

    return (
        <div class="skeleton-wrap">
            <For each={Array.from({ length: rows }, (_, i) => i)}>
                {(i) => (
                    <div
                        class="skeleton-line skeleton-stagger"
                        style={{
                            "--stagger-delay": `${i * 0.08}s`,
                            width: `${60 + i * 10}%`,
                        }}
                    ></div>
                )}
            </For>
        </div>
    );
}
