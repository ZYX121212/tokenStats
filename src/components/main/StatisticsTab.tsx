import { createResource, Show, createSignal, createMemo } from "solid-js";
import { state, setState, updateLastRefresh } from "../../stores/mainStore";
import { addToast } from "../../stores/mainStore";
import * as api from "../../scripts/lib/api";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import DataTable from "../common/DataTable";
import LineChart from "../common/LineChart";
import PieChart from "../common/PieChart";
import BarChart from "../common/BarChart";
import Skeleton from "../common/Skeleton";
import type { HourlyDataPoint, ModelStat } from "../../types";

// 时间范围选项 (hours: 0 = 全部时间)
const TIME_RANGES = [
    { hours: 1, label: "1小时", shortLabel: "1h" },
    { hours: 6, label: "6小时", shortLabel: "6h" },
    { hours: 24, label: "24小时", shortLabel: "24h" },
    { hours: 168, label: "7天", shortLabel: "7d" },
    { hours: 720, label: "30天", shortLabel: "30d" },
    { hours: 0, label: "全部", shortLabel: "全部" },
];

// 计算统计摘要
const calculateSummary = (data: {
    hourly: HourlyDataPoint[];
    model: ModelStat[];
    recentModels: ModelStat[];
}) => {
    const totalTokens = data.hourly.reduce((sum, h) => sum + h.total_tokens, 0);
    const totalCalls = data.hourly.reduce((sum, h) => sum + h.calls, 0);
    const totalPrompt = data.hourly.reduce(
        (sum, h) => sum + h.prompt_tokens,
        0,
    );
    const totalCompletion = data.hourly.reduce(
        (sum, h) => sum + h.completion_tokens,
        0,
    );
    return { totalTokens, totalCalls, totalPrompt, totalCompletion };
};

export default function StatisticsTab() {
    const [selectedRange, setSelectedRange] = createSignal(0); // 默认"全部"，与概览页一致

    const [, { refetch }] = createResource(
        () => ({ range: selectedRange(), key: state.refreshCounter }),
        async ({ range }) => {
            setState("statistics", "isLoading", true);
            try {
                // hours=0 means "all time", pass undefined to backend
                const rangeHours = range === 0 ? undefined : range;
                const [hourly, models, recentModels] = await Promise.all([
                    api.getHourlyStats(rangeHours),
                    api.getModels(),
                    api.getModelsSince(rangeHours),
                ]);
                // Always use real data — don't fall back to mock for empty results.
                // An empty array means no data in the selected time range (valid state).
                setState("statistics", {
                    hourly,
                    model: models,
                    recentModels,
                });
                updateLastRefresh();
                return { hourly, models, recentModels };
            } catch (err) {
                console.error("加载统计数据失败:", err);
                setState("statistics", {
                    hourly: [],
                    model: [],
                    recentModels: [],
                });
                addToast("加载统计数据失败", "warning");
                return { hourly: [], models: [], recentModels: [] };
            } finally {
                setState("statistics", "isLoading", false);
            }
        },
    );

    useAutoRefresh({
        interval: 30000,
        onRefresh: async () => {
            await refetch();
        },
    });

    const summary = createMemo(() => {
        const currentData = {
            hourly: state.statistics.hourly,
            model: state.statistics.model,
            recentModels: state.statistics.recentModels,
        };
        return calculateSummary(currentData);
    });

    const modelColumns = [
        { key: "model", header: "模型", width: "18%", sortable: true },
        { key: "provider", header: "提供商", width: "10%", sortable: true },
        { key: "source", header: "来源", width: "10%", sortable: true },
        { key: "total_tokens", header: "Token", width: "12%", sortable: true },
        { key: "calls", header: "请求", width: "8%", sortable: true },
        { key: "prompt_tokens", header: "输入", width: "10%", sortable: true },
        {
            key: "completion_tokens",
            header: "输出",
            width: "10%",
            sortable: true,
        },
        {
            key: "cached_tokens",
            header: "缓存",
            width: "10%",
            sortable: true,
        },
        {
            key: "reasoning_tokens",
            header: "推理",
            width: "10%",
            sortable: true,
        },
    ];

    // 根据时间范围格式化标签
    const formatHourlyLabel = (hourStr: string, hours: number) => {
        if (hours === 0) {
            return hourStr.slice(0, 10); // YYYY-MM-DD (全部)
        } else if (hours <= 24) {
            return hourStr.slice(11, 16); // HH:MM
        } else if (hours <= 168) {
            return hourStr.slice(5, 16); // MM-DD HH:MM
        } else {
            return hourStr.slice(5, 10); // MM-DD
        }
    };

    const hourlyChartData = () =>
        state.statistics.hourly.map((h) => ({
            label: formatHourlyLabel(h.hour, selectedRange()),
            value: h.total_tokens,
        }));

    const modelChartData = () =>
        state.statistics.recentModels.map((m) => ({
            label: m.model,
            value: m.total_tokens,
        }));

    const recentModelChartData = () =>
        state.statistics.recentModels.slice(0, 10).map((m) => ({
            label: m.model,
            value: m.total_tokens,
        }));

    // 获取当前时间范围的完整标签（用于卡片的 Token/请求 前缀）
    const getCurrentRangeLabel = () => {
        const range = TIME_RANGES.find((r) => r.hours === selectedRange());
        if (!range) return "24小时";
        return range.hours === 0 ? "累计" : range.label;
    };

    // 面板标题前缀（"全部"时不加"近"，其他加"近"）
    const getPanelTitle = (suffix: string) => {
        const range = TIME_RANGES.find((r) => r.hours === selectedRange());
        if (!range || range.hours === 0) return suffix;
        return `近${range.label} ${suffix}`;
    };

    // 格式化数字
    const formatNumber = (num: number) => {
        return num.toLocaleString();
    };

    return (
        <div
            class="tab-panel"
            role="tabpanel"
            id="tabpanel-statistics"
            aria-labelledby="tab-statistics"
        >
            <Show
                when={!state.statistics.isLoading}
                fallback={<Skeleton rows={8} />}
            >
                {/* Summary Cards with Comparison — data scoped to selected time range */}
                <div class="stats-summary-grid">
                    <div class="summary-card">
                        <div class="summary-label">{getCurrentRangeLabel()}Token</div>
                        <div class="summary-value">
                            {formatNumber(summary().totalTokens)}
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">{getCurrentRangeLabel()}请求</div>
                        <div class="summary-value">
                            {formatNumber(summary().totalCalls)}
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">{getCurrentRangeLabel()}输入</div>
                        <div class="summary-value">
                            {formatNumber(summary().totalPrompt)}
                        </div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">{getCurrentRangeLabel()}输出</div>
                        <div class="summary-value">
                            {formatNumber(summary().totalCompletion)}
                        </div>
                    </div>
                </div>

                {/* Hourly Trend Chart */}
                <div class="panel chart-panel-wide">
                    <div class="panel-header">
                        <div class="panel-title">
                            {getCurrentRangeLabel()}趋势
                        </div>
                        <div
                            style={{
                                display: "flex",
                                gap: "10px",
                                "align-items": "center",
                            }}
                        >
                            <div class="time-range-selector">
                                {TIME_RANGES.map((range) => (
                                    <button
                                        class={`time-range-btn ${selectedRange() === range.hours ? "active" : ""}`}
                                        onClick={() =>
                                            setSelectedRange(range.hours)
                                        }
                                        aria-label={`选择${range.label}范围`}
                                    >
                                        {range.shortLabel}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div class="chart-container responsive-chart">
                        <LineChart
                            data={hourlyChartData()}
                            color="#00d4ff"
                            width={700}
                            height={220}
                            animate={true}
                        />
                    </div>
                </div>

                {/* Charts Row */}
                <div class="panel charts-row">
                    <div class="chart-wrapper">
                        <div class="panel-header">
                            <div class="panel-title">{getPanelTitle("模型分布")}</div>
                        </div>
                        <div class="chart-container responsive-chart">
                            <PieChart
                                data={modelChartData()}
                                width={280}
                                height={280}
                            />
                        </div>
                    </div>
                    <div class="chart-wrapper">
                        <div class="panel-header">
                            <div class="panel-title">
                                {getPanelTitle("Top10")}
                            </div>
                        </div>
                        <div class="chart-container responsive-chart">
                            <BarChart
                                data={recentModelChartData()}
                                width={400}
                                height={280}
                            />
                        </div>
                    </div>
                </div>

                {/* Tables */}
                <div class="panel">
                    <div class="panel-header">
                        <div class="panel-title">{getPanelTitle("模型详情")}</div>
                    </div>
                    <DataTable
                        data={
                            state.statistics.recentModels as unknown as Record<
                                string,
                                unknown
                            >[]
                        }
                        columns={modelColumns}
                        sortable
                        searchable
                        paginated
                        pageSize={10}
                    />
                </div>
            </Show>
        </div>
    );
}
