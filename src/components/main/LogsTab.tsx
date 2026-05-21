import { createResource, Show, For, createSignal } from "solid-js";
import { state, setState, addToast } from "../../stores/mainStore";
import * as api from "../../scripts/lib/api";
import Skeleton from "../common/Skeleton";

interface RequestLog {
    id: number;
    ts: string;
    provider: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cached_tokens: number;
    latency_ms: number | null;
}

export default function LogsTab() {
    const [page, setPage] = createSignal(0);
    const pageSize = 50;

    const [data, { refetch }] = createResource(
        () => ({ pageNum: page(), key: state.refreshCounter }),
        async ({ pageNum }) => {
            setState("logs", "isLoading", true);
            try {
                const offset = pageNum * pageSize;
                const logs = await api.getRequestLogs(pageSize, offset);
                return { logs: logs as RequestLog[], page: pageNum };
            } catch (err) {
                addToast("加载请求日志失败", "warning");
                throw err;
            } finally {
                setState("logs", "isLoading", false);
            }
        },
    );

    const formatLatency = (ms: number | null) => {
        if (ms === null || ms === undefined) return "-";
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    const formatTime = (ts: string) => {
        const date = new Date(ts);
        return date.toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };

    const columns = [
        { key: "ts", header: "时间", width: "18%" },
        { key: "provider", header: "提供商", width: "12%" },
        { key: "model", header: "模型", width: "25%" },
        { key: "prompt_tokens", header: "输入", width: "10%" },
        { key: "completion_tokens", header: "输出", width: "10%" },
        { key: "total_tokens", header: "总计", width: "10%" },
        { key: "latency_ms", header: "延迟", width: "10%" },
    ];

    return (
        <div
            class="tab-panel"
            role="tabpanel"
            id="tabpanel-logs"
            aria-labelledby="tab-logs"
        >
            <Show when={!data.loading} fallback={<Skeleton rows={10} />}>
                <div class="panel">
                    <div class="panel-header">
                        <div class="panel-title">API 请求日志</div>
                        <div class="panel-actions">
                            <button
                                class="toolbar-btn"
                                onClick={() => {
                                    setPage(0);
                                    refetch();
                                }}
                            >
                                刷新
                            </button>
                        </div>
                    </div>
                    <div class="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <For each={columns}>
                                        {(col) => (
                                            <th style={{ width: col.width }}>
                                                {col.header}
                                            </th>
                                        )}
                                    </For>
                                </tr>
                            </thead>
                            <tbody>
                                <Show
                                    when={(data()?.logs ?? []).length > 0}
                                    fallback={
                                        <tr>
                                            <td colspan="7" class="empty-cell">
                                                <div class="empty-state">
                                                    <div class="empty-icon">
                                                        📋
                                                    </div>
                                                    <div class="empty-text">
                                                        暂无请求日志
                                                    </div>
                                                    <div class="empty-hint">
                                                        开始使用 API
                                                        后，日志将显示在这里
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    }
                                >
                                    <For each={data()?.logs ?? []}>
                                        {(log) => (
                                            <tr>
                                                <td class="time-cell">
                                                    {formatTime(log.ts)}
                                                </td>
                                                <td>
                                                    <span
                                                        class={`provider-badge provider-${log.provider.toLowerCase()}`}
                                                    >
                                                        {log.provider}
                                                    </span>
                                                </td>
                                                <td
                                                    class="model-cell"
                                                    title={log.model}
                                                >
                                                    <span class="model-name">
                                                        {log.model}
                                                    </span>
                                                </td>
                                                <td class="token-cell">
                                                    {log.prompt_tokens.toLocaleString()}
                                                </td>
                                                <td class="token-cell">
                                                    {log.completion_tokens.toLocaleString()}
                                                </td>
                                                <td class="token-cell total">
                                                    {log.total_tokens.toLocaleString()}
                                                </td>
                                                <td class="latency-cell">
                                                    <span
                                                        class={`latency-badge ${(log.latency_ms ?? 0) > 5000 ? "slow" : ""}`}
                                                    >
                                                        {formatLatency(
                                                            log.latency_ms,
                                                        )}
                                                    </span>
                                                </td>
                                            </tr>
                                        )}
                                    </For>
                                </Show>
                            </tbody>
                        </table>
                    </div>
                    <div class="pagination-row">
                        <button
                            class="page-btn"
                            disabled={page() === 0}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            上一页
                        </button>
                        <span class="page-info">第 {page() + 1} 页</span>
                        <button
                            class="page-btn"
                            disabled={(data()?.logs?.length ?? 0) < pageSize}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            下一页
                        </button>
                    </div>
                </div>
            </Show>
        </div>
    );
}
