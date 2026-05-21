import { createResource, Show } from "solid-js";
import { state, setState } from "../../stores/mainStore";
import * as api from "../../scripts/lib/api";
import Skeleton from "../common/Skeleton";
import type { DiagnosticsData } from "../../types";

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}天 ${h}小时 ${m}分钟`;
}

export default function DiagnosticsTab() {
    const [diagData] = createResource<DiagnosticsData>(async () => {
        setState("diagnostics", "isLoading", true);
        try {
            const data = await api.getDiagnostics();
            setState("diagnostics", "data", data);
            return data;
        } catch (err) {
            console.error("加载诊断数据失败:", err);
            setState("diagnostics", "isLoading", false);
            throw err;
        } finally {
            if (state.diagnostics.isLoading) {
                setState("diagnostics", "isLoading", false);
            }
        }
    });

    const displayData = () => diagData() ?? state.diagnostics.data;

    return (
        <div
            class="tab-panel"
            role="tabpanel"
            id="tabpanel-diagnostics"
            aria-labelledby="tab-diagnostics"
        >
            <Show
                when={!state.diagnostics.isLoading}
                fallback={<Skeleton rows={6} />}
            >
                <div class="panel">
                    <div class="panel-header">
                        <div class="panel-title">系统信息</div>
                    </div>
                    <div class="diagnostics-grid">
                        <div class="diag-item">
                            <div class="diag-label">数据库大小</div>
                            <div class="diag-value">
                                {formatBytes(displayData().db_size_bytes)}
                            </div>
                        </div>
                        <div class="diag-item">
                            <div class="diag-label">数据库记录数</div>
                            <div class="diag-value">
                                {displayData().db_row_count?.toLocaleString()}
                            </div>
                        </div>
                        <div class="diag-item">
                            <div class="diag-label">最近事件时间</div>
                            <div class="diag-value">
                                {displayData().db_last_event_time || "-"}
                            </div>
                        </div>
                        <div class="diag-item">
                            <div class="diag-label">代理运行时间</div>
                            <div class="diag-value">
                                {formatUptime(displayData().proxy_uptime_secs)}
                            </div>
                        </div>
                        <div class="diag-item">
                            <div class="diag-label">代理总请求数</div>
                            <div class="diag-value">
                                {displayData().proxy_total_requests?.toLocaleString()}
                            </div>
                        </div>
                        <div class="diag-item">
                            <div class="diag-label">活跃连接数</div>
                            <div class="diag-value">
                                {displayData().proxy_active_connections}
                            </div>
                        </div>
                        <div class="diag-item">
                            <div class="diag-label">代理错误率</div>
                            <div class="diag-value">{`${displayData().proxy_error_rate_pct.toFixed(1)}%`}</div>
                        </div>
                        <div class="diag-item">
                            <div class="diag-label">配置文件</div>
                            <div class="diag-value">
                                {displayData().config_file_exists
                                    ? "存在"
                                    : "不存在"}
                            </div>
                        </div>
                        <div class="diag-item">
                            <div class="diag-label">配置路径</div>
                            <div
                                class="diag-value"
                                style="font-size: 0.85em; overflow-wrap: break-word;"
                            >
                                {displayData().config_file_path}
                            </div>
                        </div>
                        <div class="diag-item">
                            <div class="diag-label">端口配置</div>
                            <div class="diag-value">
                                {displayData().config_port_valid
                                    ? "有效"
                                    : "无效"}
                            </div>
                        </div>
                        <div class="diag-item">
                            <div class="diag-label">API Key</div>
                            <div class="diag-value">
                                {displayData().config_api_key_configured
                                    ? "已配置"
                                    : "未配置"}
                            </div>
                        </div>
                    </div>
                </div>
            </Show>
        </div>
    );
}
