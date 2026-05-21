import { onMount, onCleanup, createEffect, createSignal } from "solid-js";
import { colorForModel } from "../../scripts/lib/utils";

interface BarChartProps {
    data: { label: string; value: number }[];
    width?: number;
    height?: number;
    animate?: boolean;
}

export default function BarChart(props: BarChartProps) {
    let canvasRef: HTMLCanvasElement | undefined;
    let containerRef: HTMLDivElement | undefined;
    let animFrame: number;

    const width = () => props.width ?? 400;
    const height = () => props.height ?? 200;
    const data = () => props.data ?? [];

    const [tooltip, setTooltip] = createSignal<{
        x: number;
        y: number;
        label: string;
        value: number;
        color: string;
        visible: boolean;
    } | null>(null);

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };

    function getChartMetrics() {
        const w = width();
        const h = height();
        const items = data();
        const max = Math.max(...items.map((i) => i.value), 1);
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        const barWidth = (chartW / items.length) * 0.7;
        const barGap = (chartW / items.length) * 0.3;
        return { w, h, items, max, chartW, chartH, barWidth, barGap };
    }

    function draw(
        ctx: CanvasRenderingContext2D,
        progress = 1,
        highlightIndex = -1,
    ) {
        const { w, h, items, max, chartH, barWidth, barGap } =
            getChartMetrics();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        if (!canvasRef || items.length === 0) return;

        canvasRef.width = w * dpr;
        canvasRef.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // Grid lines
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();
        }

        // Y axis labels
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "right";
        for (let i = 0; i <= 4; i++) {
            const value = max - (max / 4) * i;
            const y = padding.top + (chartH / 4) * i;
            ctx.fillText(String(Math.round(value)), padding.left - 8, y + 4);
        }

        // Bars
        items.forEach((item, index) => {
            const barHeight = (item.value / max) * chartH * progress;
            const x = padding.left + index * (barWidth + barGap) + barGap / 2;
            const y = padding.top + chartH - barHeight;
            const color = colorForModel(item.label);
            const isHighlighted = index === highlightIndex;

            // Bar
            ctx.fillStyle = isHighlighted ? color : color + "cc";
            ctx.fillRect(x, y, barWidth, barHeight);

            // Bar top highlight
            ctx.fillStyle = isHighlighted ? "#fff" : color;
            ctx.fillRect(x, y, barWidth, 2);

            // Highlight glow
            if (isHighlighted) {
                ctx.shadowColor = color;
                ctx.shadowBlur = 12;
                ctx.fillRect(x, y, barWidth, barHeight);
                ctx.shadowBlur = 0;
            }

            // Label
            if (progress > 0.8) {
                ctx.fillStyle = isHighlighted
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(255,255,255,0.5)";
                ctx.font = isHighlighted
                    ? "bold 10px sans-serif"
                    : "9px sans-serif";
                ctx.textAlign = "center";
                const label =
                    item.label.slice(0, 6) +
                    (item.label.length > 6 ? ".." : "");
                ctx.fillText(label, x + barWidth / 2, h - 8);
            }
        });
    }

    function handleMouseMove(e: MouseEvent) {
        if (!containerRef || data().length === 0) return;
        const rect = containerRef.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const { w, items, barWidth, barGap } = getChartMetrics();

        if (mouseX < padding.left || mouseX > w - padding.right) {
            setTooltip(null);
            const ctx = canvasRef?.getContext("2d", { alpha: true });
            if (ctx) draw(ctx, 1, -1);
            return;
        }

        const chartX = mouseX - padding.left;
        const index = Math.floor(chartX / (barWidth + barGap));
        const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
        const item = items[clampedIndex];

        setTooltip({
            x: e.clientX + 12,
            y: e.clientY - 12,
            label: item.label,
            value: item.value,
            color: colorForModel(item.label),
            visible: true,
        });

        const ctx = canvasRef?.getContext("2d", { alpha: true });
        if (ctx) draw(ctx, 1, clampedIndex);
    }

    function handleMouseLeave() {
        setTooltip(null);
        const ctx = canvasRef?.getContext("2d", { alpha: true });
        if (ctx) draw(ctx, 1, -1);
    }

    onMount(() => {
        if (!canvasRef) return;
        const ctx = canvasRef.getContext("2d", { alpha: true });
        if (!ctx) return;
        const safeCtx: CanvasRenderingContext2D = ctx;

        if (props.animate !== false) {
            const startTime = performance.now();
            const duration = 800;

            function animate(now: number) {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                draw(safeCtx, eased);
                if (progress < 1) {
                    animFrame = requestAnimationFrame(animate);
                }
            }
            animFrame = requestAnimationFrame(animate);
        } else {
            draw(safeCtx);
        }
    });

    createEffect(() => {
        if (!canvasRef || props.animate === false) return;
        const ctx = canvasRef.getContext("2d", { alpha: true });
        if (!ctx) return;
        draw(ctx);
    });

    onCleanup(() => {
        if (animFrame) cancelAnimationFrame(animFrame);
    });

    return (
        <div
            ref={containerRef}
            class="chart-wrapper"
            style={{
                position: "relative",
                width: `${width()}px`,
                height: `${height()}px`,
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            {data().length === 0 ? (
                <div class="chart-empty-state">
                    <div class="chart-empty-title">暂无模型数据</div>
                    <div class="chart-empty-description">请求产生后会显示排行</div>
                </div>
            ) : (
                <canvas
                    ref={canvasRef}
                    style={{
                        width: `${width()}px`,
                        height: `${height()}px`,
                    }}
                />
            )}
            {tooltip() && tooltip()!.visible && (
                <div
                    class="chart-tooltip visible"
                    style={{
                        position: "fixed",
                        left: `${tooltip()!.x}px`,
                        top: `${tooltip()!.y}px`,
                    }}
                >
                    <div class="tooltip-label">{tooltip()!.label}</div>
                    <div
                        class="tooltip-value"
                        style={{ color: tooltip()!.color }}
                    >
                        {tooltip()!.value.toLocaleString()}
                    </div>
                </div>
            )}
        </div>
    );
}
