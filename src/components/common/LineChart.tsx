import {
    onMount,
    onCleanup,
    createEffect,
    createSignal,
    createMemo,
} from "solid-js";

interface LineChartProps {
    data: { label: string; value: number }[];
    color?: string;
    width?: number;
    height?: number;
    animate?: boolean;
}

// 优化的缓动函数
function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export default function LineChart(props: LineChartProps) {
    let canvasRef: HTMLCanvasElement | undefined;
    let containerRef: HTMLDivElement | undefined;
    let animFrame: number;
    let currentProgress = 0;
    let previousData: { label: string; value: number }[] = [];
    let isAnimating = false;

    const color = () => props.color ?? "#00d4ff";
    const width = () => props.width ?? 600;
    const height = () => props.height ?? 200;
    const data = () => props.data ?? [];

    const [tooltip, setTooltip] = createSignal<{
        x: number;
        y: number;
        label: string;
        value: number;
        visible: boolean;
    } | null>(null);

    const [hoveredIndex, setHoveredIndex] = createSignal<number | null>(null);

    const padding = { top: 20, right: 20, bottom: 30, left: 50 };

    // 缓存图表指标计算结果
    const chartMetrics = createMemo(() => {
        const w = width();
        const h = height();
        const points = data();
        const max = Math.max(...points.map((p) => p.value), 1);
        const min = Math.min(...points.map((p) => p.value), 0);
        const range = max - min || 1;
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        return { w, h, points, max, min, range, chartW, chartH };
    });

    // 检查数据是否发生变化
    function hasDataChanged(
        newData: { label: string; value: number }[],
        oldData: { label: string; value: number }[],
    ): boolean {
        if (newData.length !== oldData.length) return true;
        for (let i = 0; i < newData.length; i++) {
            if (
                newData[i].value !== oldData[i].value ||
                newData[i].label !== oldData[i].label
            ) {
                return true;
            }
        }
        return false;
    }

    // 根据进度插值数据
    function interpolateData(
        progress: number,
        oldData: { label: string; value: number }[],
        newData: { label: string; value: number }[],
    ) {
        const maxLength = Math.max(oldData.length, newData.length);
        const result = [];

        for (let i = 0; i < maxLength; i++) {
            const oldPoint = oldData[i] || { value: 0, label: "" };
            const newPoint = newData[i] || { value: 0, label: "" };
            const targetValue =
                i < newData.length ? newPoint.value : oldPoint.value;
            const startValue = i < oldData.length ? oldPoint.value : 0;

            result.push({
                label: newPoint.label || oldPoint.label,
                value: startValue + (targetValue - startValue) * progress,
            });
        }
        return result;
    }

    function draw(
        ctx: CanvasRenderingContext2D,
        progress = 1,
        interpolatedPoints?: { label: string; value: number }[],
    ) {
        const { w, h, points, max, min, range, chartW, chartH } =
            chartMetrics();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const displayPoints = interpolatedPoints || points;

        if (!canvasRef || displayPoints.length === 0) return;

        canvasRef.width = w * dpr;
        canvasRef.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // 网格线 - 完全兼容深色和浅色主题
        ctx.strokeStyle = "rgba(128, 128, 128, 0.15)";
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();
        }

        // Y 轴标签 - 完全兼容深色和浅色主题
        ctx.fillStyle = "rgba(128, 128, 128, 0.7)";
        ctx.font =
            '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = "right";
        for (let i = 0; i <= 4; i++) {
            const value = max - (range / 4) * i;
            const y = padding.top + (chartH / 4) * i;
            ctx.fillText(String(Math.round(value)), padding.left - 8, y + 4);
        }

        // 计算可见点数
        const visibleCount = Math.max(
            2,
            Math.floor(displayPoints.length * progress),
        );

        // 绘制渐变区域填充
        if (visibleCount >= 2) {
            const areaGradient = ctx.createLinearGradient(
                0,
                padding.top,
                0,
                padding.top + chartH,
            );
            areaGradient.addColorStop(0, color() + "30");
            areaGradient.addColorStop(1, color() + "05");

            ctx.beginPath();
            const firstX = padding.left;
            const firstY =
                padding.top +
                chartH -
                ((displayPoints[0].value - min) / range) * chartH;
            ctx.moveTo(firstX, padding.top + chartH);
            ctx.lineTo(firstX, firstY);

            for (let i = 1; i < visibleCount; i++) {
                const x =
                    padding.left + (i / (displayPoints.length - 1)) * chartW;
                const y =
                    padding.top +
                    chartH -
                    ((displayPoints[i].value - min) / range) * chartH;
                ctx.lineTo(x, y);
            }

            const lastX =
                padding.left +
                ((visibleCount - 1) / (displayPoints.length - 1)) * chartW;
            ctx.lineTo(lastX, padding.top + chartH);
            ctx.closePath();
            ctx.fillStyle = areaGradient;
            ctx.fill();
        }

        // 绘制线条
        if (visibleCount >= 2) {
            ctx.beginPath();
            ctx.strokeStyle = color();
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            for (let i = 0; i < visibleCount; i++) {
                const x =
                    padding.left + (i / (displayPoints.length - 1)) * chartW;
                const y =
                    padding.top +
                    chartH -
                    ((displayPoints[i].value - min) / range) * chartH;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // X 轴标签 - 完全兼容深色和浅色主题
        ctx.fillStyle = "rgba(128, 128, 128, 0.6)";
        ctx.textAlign = "center";
        const step = Math.ceil(displayPoints.length / 8);
        for (let i = 0; i < visibleCount; i += step) {
            const x = padding.left + (i / (displayPoints.length - 1)) * chartW;
            ctx.fillText(displayPoints[i].label, x, h - 8);
        }

        // 绘制悬停高亮
        const hoverIdx = hoveredIndex();
        if (hoverIdx !== null && hoverIdx < displayPoints.length) {
            const hoverX =
                padding.left + (hoverIdx / (displayPoints.length - 1)) * chartW;
            const hoverY =
                padding.top +
                chartH -
                ((displayPoints[hoverIdx].value - min) / range) * chartH;

            // 垂直高亮线
            ctx.beginPath();
            ctx.strokeStyle = color() + "50";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.moveTo(hoverX, padding.top);
            ctx.lineTo(hoverX, padding.top + chartH);
            ctx.stroke();
            ctx.setLineDash([]);

            // 高亮数据点
            ctx.beginPath();
            ctx.arc(hoverX, hoverY, 8, 0, Math.PI * 2);
            ctx.fillStyle = color() + "30";
            ctx.fill();

            ctx.beginPath();
            ctx.arc(hoverX, hoverY, 5, 0, Math.PI * 2);
            ctx.fillStyle = color();
            ctx.fill();

            ctx.beginPath();
            ctx.arc(hoverX, hoverY, 2, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
        }

        // 绘制终点（如果没有悬停）
        if (hoverIdx === null && visibleCount >= 1) {
            const lastIdx = visibleCount - 1;
            const lastX =
                padding.left + (lastIdx / (displayPoints.length - 1)) * chartW;
            const lastY =
                padding.top +
                chartH -
                ((displayPoints[lastIdx].value - min) / range) * chartH;

            ctx.beginPath();
            ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
            ctx.fillStyle = color();
            ctx.fill();

            ctx.beginPath();
            ctx.arc(lastX, lastY, 10, 0, Math.PI * 2);
            ctx.fillStyle = color() + "30";
            ctx.fill();
        }
    }

    function handleMouseMove(e: MouseEvent) {
        if (!containerRef || data().length === 0) return;
        const rect = containerRef.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const { w, points, chartW } = chartMetrics();

        if (mouseX < padding.left || mouseX > w - padding.right) {
            setTooltip(null);
            setHoveredIndex(null);
            const ctx = canvasRef?.getContext("2d", { alpha: true });
            if (ctx) draw(ctx, currentProgress);
            return;
        }

        const chartX = mouseX - padding.left;
        const index = Math.round((chartX / chartW) * (points.length - 1));
        const clampedIndex = Math.max(0, Math.min(index, points.length - 1));
        const point = points[clampedIndex];

        // 计算 tooltip 位置，避免超出屏幕
        let tooltipX = e.clientX + 16;
        let tooltipY = e.clientY - 12;

        // 简单的边界检查
        if (tooltipX + 200 > window.innerWidth) {
            tooltipX = e.clientX - 200;
        }

        setTooltip({
            x: tooltipX,
            y: tooltipY,
            label: point.label,
            value: point.value,
            visible: true,
        });

        setHoveredIndex(clampedIndex);

        // 重绘以显示高亮
        const ctx = canvasRef?.getContext("2d", { alpha: true });
        if (ctx) draw(ctx, currentProgress);
    }

    function handleMouseLeave() {
        setTooltip(null);
        setHoveredIndex(null);
        const ctx = canvasRef?.getContext("2d", { alpha: true });
        if (ctx) draw(ctx, currentProgress);
    }

    // 带插值的数据过渡动画
    function animateDataTransition(
        oldData: { label: string; value: number }[],
        newData: { label: string; value: number }[],
    ) {
        if (isAnimating) return;

        isAnimating = true;
        const startTime = performance.now();
        const duration = 600;

        function animate(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeInOutQuad(progress);
            currentProgress = eased;

            const interpolatedPoints = interpolateData(eased, oldData, newData);
            const ctx = canvasRef?.getContext("2d", { alpha: true });
            if (ctx) {
                draw(ctx, 1, interpolatedPoints);
            }

            if (progress < 1) {
                animFrame = requestAnimationFrame(animate);
            } else {
                isAnimating = false;
                previousData = [...newData];
                currentProgress = 1;
            }
        }

        animFrame = requestAnimationFrame(animate);
    }

    // 初始加载动画
    function animateInitialLoad() {
        if (isAnimating) return;

        isAnimating = true;
        const startTime = performance.now();
        const duration = 1000;

        function animate(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeOutCubic(progress);
            currentProgress = eased;

            const ctx = canvasRef?.getContext("2d", { alpha: true });
            if (ctx) {
                draw(ctx, eased);
            }

            if (progress < 1) {
                animFrame = requestAnimationFrame(animate);
            } else {
                isAnimating = false;
                previousData = [...data()];
                currentProgress = 1;
            }
        }

        animFrame = requestAnimationFrame(animate);
    }

    onMount(() => {
        if (!canvasRef) return;
        const ctx = canvasRef.getContext("2d", { alpha: true });
        if (!ctx) return;

        previousData = [...data()];

        if (props.animate !== false) {
            animateInitialLoad();
        } else {
            currentProgress = 1;
            draw(ctx);
        }
    });

    // 监听数据变化
    createEffect(() => {
        if (!canvasRef) return;

        const newData = data();
        const ctx = canvasRef.getContext("2d", { alpha: true });
        if (!ctx) return;

        if (
            hasDataChanged(newData, previousData) &&
            props.animate !== false &&
            previousData.length > 0
        ) {
            animateDataTransition(previousData, newData);
        } else if (props.animate === false || previousData.length === 0) {
            previousData = [...newData];
            currentProgress = 1;
            draw(ctx);
        }
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
                    <div class="chart-empty-title">暂无趋势数据</div>
                    <div class="chart-empty-description">有请求后会显示时间序列</div>
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
                        "z-index": 1000,
                    }}
                >
                    <div class="tooltip-label">{tooltip()!.label}</div>
                    <div class="tooltip-value" style={{ color: color() }}>
                        {tooltip()!.value.toLocaleString()}
                    </div>
                </div>
            )}
        </div>
    );
}
