import { onMount, onCleanup, createEffect, createSignal } from "solid-js";
import { colorForModel } from "../../scripts/lib/utils";

interface PieChartProps {
    data: { label: string; value: number }[];
    width?: number;
    height?: number;
    animate?: boolean;
}

export default function PieChart(props: PieChartProps) {
    let canvasRef: HTMLCanvasElement | undefined;
    let containerRef: HTMLDivElement | undefined;
    let animFrame: number;

    const width = () => props.width ?? 200;
    const height = () => props.height ?? 200;
    const data = () => props.data ?? [];

    const [tooltip, setTooltip] = createSignal<{
        x: number;
        y: number;
        label: string;
        value: number;
        percent: number;
        color: string;
        visible: boolean;
    } | null>(null);

    function getChartMetrics() {
        const w = width();
        const h = height();
        const items = data();
        const total = items.reduce((sum, item) => sum + item.value, 0);
        const centerX = w / 2;
        const centerY = h / 2;
        const radius = Math.min(w, h) / 2 - 20;
        const innerRadius = radius * 0.55;
        return { w, h, items, total, centerX, centerY, radius, innerRadius };
    }

    function draw(
        ctx: CanvasRenderingContext2D,
        progress = 1,
        highlightIndex = -1,
    ) {
        const { w, h, items, total, centerX, centerY, radius, innerRadius } =
            getChartMetrics();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        if (!canvasRef || items.length === 0 || total === 0) return;

        canvasRef.width = w * dpr;
        canvasRef.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        let currentAngle = -Math.PI / 2;

        items.forEach((item, index) => {
            const sliceAngle = (item.value / total) * Math.PI * 2 * progress;
            const endAngle = currentAngle + sliceAngle;
            const color = colorForModel(item.label);
            const isHighlighted = index === highlightIndex;
            const drawRadius = isHighlighted ? radius + 4 : radius;

            // Slice
            ctx.beginPath();
            ctx.arc(centerX, centerY, drawRadius, currentAngle, endAngle);
            ctx.arc(
                centerX,
                centerY,
                innerRadius,
                endAngle,
                currentAngle,
                true,
            );
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            // Border
            ctx.strokeStyle = "rgba(10,10,12,0.8)";
            ctx.lineWidth = 2;
            ctx.stroke();

            // Highlight effect
            if (isHighlighted) {
                ctx.shadowColor = color;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(centerX, centerY, drawRadius, currentAngle, endAngle);
                ctx.arc(
                    centerX,
                    centerY,
                    innerRadius,
                    endAngle,
                    currentAngle,
                    true,
                );
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // Label for slices > 5%
            if (progress > 0.8 && item.value / total > 0.05) {
                const midAngle = currentAngle + sliceAngle / 2;
                const labelRadius = radius + 16;
                const lx = centerX + Math.cos(midAngle) * labelRadius;
                const ly = centerY + Math.sin(midAngle) * labelRadius;

                ctx.fillStyle = isHighlighted
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(255,255,255,0.7)";
                ctx.font = isHighlighted
                    ? "bold 11px sans-serif"
                    : "10px sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(
                    `${item.label.slice(0, 8)}${item.label.length > 8 ? ".." : ""}`,
                    lx,
                    ly - 6,
                );
                ctx.fillStyle = color;
                ctx.fillText(
                    `${Math.round((item.value / total) * 100)}%`,
                    lx,
                    ly + 6,
                );
            }

            currentAngle = endAngle;
        });

        // Center text
        if (progress > 0.5) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.font = "bold 14px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("Token", centerX, centerY - 8);
            ctx.fillStyle = "rgba(255,255,255,0.6)";
            ctx.font = "12px sans-serif";
            ctx.fillText(total.toLocaleString(), centerX, centerY + 8);
        }
    }

    function handleMouseMove(e: MouseEvent) {
        if (!containerRef || data().length === 0) return;
        const rect = containerRef.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const { items, total, centerX, centerY, radius, innerRadius } =
            getChartMetrics();

        const dx = mouseX - centerX;
        const dy = mouseY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < innerRadius || distance > radius + 10) {
            setTooltip(null);
            const ctx = canvasRef?.getContext("2d", { alpha: true });
            if (ctx) draw(ctx, 1, -1);
            return;
        }

        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) angle += Math.PI * 2;
        if (angle < -Math.PI / 2) angle += Math.PI * 2;

        let currentAngle = -Math.PI / 2;
        let foundIndex = -1;

        for (let i = 0; i < items.length; i++) {
            const sliceAngle = (items[i].value / total) * Math.PI * 2;
            const endAngle = currentAngle + sliceAngle;
            if (angle >= currentAngle && angle < endAngle) {
                foundIndex = i;
                break;
            }
            currentAngle = endAngle;
        }

        if (foundIndex === -1) {
            setTooltip(null);
            const ctx = canvasRef?.getContext("2d", { alpha: true });
            if (ctx) draw(ctx, 1, -1);
            return;
        }

        const item = items[foundIndex];
        setTooltip({
            x: e.clientX + 12,
            y: e.clientY - 12,
            label: item.label,
            value: item.value,
            percent: Math.round((item.value / total) * 100),
            color: colorForModel(item.label),
            visible: true,
        });

        const ctx = canvasRef?.getContext("2d", { alpha: true });
        if (ctx) draw(ctx, 1, foundIndex);
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
                    <div class="chart-empty-title">暂无分布数据</div>
                    <div class="chart-empty-description">请求产生后会显示占比</div>
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
                        {tooltip()!.value.toLocaleString()} (
                        {tooltip()!.percent}%)
                    </div>
                </div>
            )}
        </div>
    );
}
