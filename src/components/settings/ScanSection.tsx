import { createResource, createSignal, For, Show, onCleanup, onMount } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import * as api from "../../scripts/lib/api";
import { addToast } from "../../stores/mainStore";
import type { ScanResult, ScanHistory } from "../../types";

export default function ScanSection() {
  const [scanResults, setScanResults] = createSignal<ScanResult[]>([]);
  const [scanHistory, setScanHistory] = createSignal<ScanHistory[]>([]);
  const [isScanning, setIsScanning] = createSignal(false);
  const [lastAutoScan, setLastAutoScan] = createSignal<Date | null>(null);

  createResource(async () => {
    try {
      const history = await api.getScanHistory();
      setScanHistory(history);
    } catch (_) {
      // scan_history table may not exist yet
    }
  });

  // Listen for auto-scan events from the Rust backend
  onMount(() => {
    let unlistenFn: (() => void) | null = null;
    listen<ScanResult[]>("auto-scan-complete", (event) => {
      const results = event.payload;
      setScanResults(results);
      setLastAutoScan(new Date());
      const totalNew = results.reduce((sum, r) => sum + r.records_new, 0);
      if (totalNew > 0) {
        addToast(`自动扫描完成，导入 ${totalNew} 条新记录`);
      }
      api.getScanHistory().then(setScanHistory).catch(() => {});
    }).then((fn) => {
      unlistenFn = fn;
    });

    onCleanup(() => {
      unlistenFn?.();
    });
  });

  async function handleScan() {
    setIsScanning(true);
    try {
      const results = await api.scanAllPlatforms();
      setScanResults(results);
      const totalNew = results.reduce((sum, r) => sum + r.records_new, 0);
      if (totalNew > 0) {
        addToast(`扫描完成，导入 ${totalNew} 条新记录`);
      } else {
        addToast("扫描完成，没有发现新记录");
      }
      const history = await api.getScanHistory();
      setScanHistory(history);
    } catch (err) {
      addToast("扫描失败", "warning");
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <div class="settings-section scan-section">
      <div class="section-header">
        <span class="section-icon">📊</span>
        <div>
          <div class="section-title">从 AI 工具导入数据</div>
          <div class="section-description">
            每 30 分钟自动扫描 Claude Code、Codex CLI 等工具的本地数据
            {lastAutoScan() && (
              <span class="auto-scan-time">
                ，上次自动扫描: {lastAutoScan()!.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </div>
      <div class="section-body">
        <div class="scan-actions">
          <button
            class="btn-scan"
            disabled={isScanning()}
            onClick={handleScan}
          >
            {isScanning() ? "扫描中..." : "立即扫描"}
          </button>
        </div>

        <Show when={scanResults().length > 0}>
          <div class="scan-results">
            <div class="scan-results-title">最近扫描结果</div>
            <For each={scanResults()}>
              {(result) => (
                <div class="scan-result-item">
                  <span class="scan-platform">{result.display_name}</span>
                  <span class="scan-stats">
                    发现 {result.records_found} 条，新增 {result.records_new} 条
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={scanResults().length === 0 && scanHistory().length === 0}>
          <div class="empty-state" style="padding: 24px; min-height: auto; background: var(--surface); border-radius: 10px; border: 1px dashed var(--border);">
            <div class="empty-icon">📡</div>
            <div class="empty-text" style="font-size: 13px; color: var(--text-muted);">尚未扫描任何 AI 工具</div>
            <div class="empty-hint" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">点击上方按钮开始扫描</div>
          </div>
        </Show>

        <Show when={scanHistory().length > 0}>
          <div class="scan-history">
            <div class="scan-history-title">历史扫描记录</div>
            <For each={scanHistory().slice(0, 10)}>
              {(record) => (
                <div class="scan-history-item">
                  <span class="scan-platform">{record.platform}</span>
                  <span class="scan-stats">+{record.records_new} 条</span>
                  <span class="scan-time">{record.scanned_at}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
