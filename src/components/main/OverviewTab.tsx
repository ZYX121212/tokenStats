import { createResource, Show, For, onMount, createEffect } from "solid-js";
import { state, setState, updateLastRefresh } from "../../stores/mainStore";
import { addToast } from "../../stores/mainStore";
import * as api from "../../scripts/lib/api";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import StatCard from "./StatCard";
import Skeleton from "../common/Skeleton";
import type { StatsDto, CostBreakdown, SourceSummary } from "../../types";

const STAT_CONFIG = [
    {
        key: "today_tokens",
        label: "今日 Token",
        color: "#00d4ff",
        featured: true,
        isNumber: true,
    },
    {
        key: "five_min_tokens",
        label: "5 分钟",
        color: "#ffb347",
        isNumber: true,
    },
    {
        key: "total_tokens",
        label: "累计 Token",
        color: "#2dd4a8",
        isNumber: true,
    },
    {
        key: "estimated_cost",
        label: "预估费用",
        color: "#a78bfa",
        isNumber: false,
    },
];

const COST_ITEMS = [
    { key: "input_cost" as const, label: "输入", color: "#60a5fa" },
    { key: "output_cost" as const, label: "输出", color: "#2dd4a8" },
    { key: "cache_cost" as const, label: "缓存", color: "#ffb347" },
    { key: "reasoning_cost" as const, label: "推理", color: "#a78bfa" },
];

function CostBreakdownSection(props: { data: CostBreakdown }) {
    return (
        <div class="cost-breakdown">
            <div class="cost-breakdown-title">费用构成</div>
            <div class="cost-breakdown-grid">
                <For each={COST_ITEMS}>
                    {(item) => (
                        <div class="cost-item">
                            <span
                                class="cost-dot"
                                style={{ background: item.color }}
                            />
                            <span class="cost-label">{item.label}</span>
                            <span class="cost-value">
                                {props.data[item.key]}
                            </span>
                        </div>
                    )}
                </For>
            </div>
        </div>
    );
}

function sourceLabel(source: string) {
    const label: Record<string, string> = {
        proxy: "代理",
        "claude-code": "Claude Code",
        "codex-cli": "Codex CLI",
    };
    return label[source] ?? source;
}

export default function OverviewTab() {
    const [stats, { refetch }] = createResource<StatsDto>(() =>
        api.getStats(),
    );

    const [sourceData, { refetch: refetchSourceData }] = createResource<SourceSummary[]>(() =>
        api.getSourceSummary().catch(() => []),
    );

    createEffect(() => {
        setState("overview", "isLoading", stats.loading);
    });

    createEffect(() => {
        const data = stats();
        if (data) {
            setState(
                "overview",
                "stats",
                data as unknown as Record<string, string | number>,
            );
            updateLastRefresh();
        }
    });

    createEffect(() => {
        const err = stats.error;
        if (err) {
            console.error("Failed to load stats:", err);
            addToast("加载统计数据失败", "warning");
        }
    });

    // Re-fetch when settings change (refreshCounter incremented)
    createEffect(() => {
        const counter = state.refreshCounter;
        if (counter > 0) {
            refetch();
            refetchSourceData();
        }
    });

    useAutoRefresh({
        interval: 30000,
        onRefresh: async () => {
            await Promise.all([refetch(), refetchSourceData()]);
        },
    });

    onMount(() => {
        refetch();
        refetchSourceData();
    });

    const displayStats = () => stats();
    const hasData = () => !state.overview.isLoading && stats() != null;
    const sourceTotal = () =>
        sourceData()?.reduce((sum, item) => sum + item.total_tokens, 0) ?? 0;

    return (
        <div
            class="tab-panel"
            role="tabpanel"
            id="tabpanel-overview"
            aria-labelledby="tab-overview"
        >
            <Show when={hasData()} fallback={<Skeleton type="stats" />}>
                <section class="overview-board" aria-label="核心统计">
                    <div class="overview-primary">
                        <div class="overview-kicker">当前计量窗口</div>
                        <div class="overview-main-value">
                            {displayStats()!.today_tokens.toLocaleString()}
                        </div>
                        <div class="overview-main-label">今日 Token</div>
                        <div class="overview-split">
                            <div>
                                <span>5 分钟</span>
                                <strong>
                                    {displayStats()!.five_min_tokens.toLocaleString()}
                                </strong>
                            </div>
                            <div>
                                <span>当前模型</span>
                                <strong>{displayStats()!.current_model}</strong>
                            </div>
                        </div>
                    </div>
                    <div class="overview-secondary">
                        <div class="stats-grid overview-stats-grid">
                            <For each={STAT_CONFIG.filter((item) => item.key !== "today_tokens")}>
                                {(config) => {
                                    const rawValue =
                                        (
                                            displayStats() as unknown as Record<
                                                string,
                                                string | number
                                            >
                                        )[config.key] ?? "-";
                                    const value = config.isNumber
                                        ? typeof rawValue === "string"
                                            ? parseFloat(rawValue) || 0
                                            : rawValue
                                        : rawValue;
                                    return (
                                        <StatCard
                                            label={config.label}
                                            value={value}
                                            color={config.color}
                                        />
                                    );
                                }}
                            </For>
                        </div>
                        <Show when={displayStats()?.cost_breakdown}>
                            <CostBreakdownSection data={displayStats()!.cost_breakdown!} />
                        </Show>
                    </div>
                </section>
                <Show when={(sourceData()?.length ?? 0) > 0}>
                    <section class="source-distribution" aria-label="数据来源">
                        <div class="source-distribution-title">数据来源</div>
                        <div class="source-bars">
                            <For each={sourceData()}>
                                {(item) => {
                                    const pct = sourceTotal() > 0
                                        ? Math.round((item.total_tokens / sourceTotal()) * 100)
                                        : 0;
                                    const colors: Record<string, string> = {
                                        proxy: "#60a5fa",
                                        "claude-code": "#a78bfa",
                                        "codex-cli": "#2dd4a8",
                                    };
                                    const color = colors[item.source] ?? "#ffb347";
                                    return (
                                        <div class="source-bar-row">
                                            <span class="source-bar-label">
                                                {sourceLabel(item.source)}
                                            </span>
                                            <div class="source-bar-track">
                                                <div
                                                    class="source-bar-fill"
                                                    style={{
                                                        width: `${pct}%`,
                                                        background: color,
                                                    }}
                                                />
                                            </div>
                                            <span class="source-bar-value">
                                                {pct}% · {item.total_tokens.toLocaleString()}
                                            </span>
                                        </div>
                                    );
                                }}
                            </For>
                        </div>
                    </section>
                </Show>
            </Show>
        </div>
    );
}
