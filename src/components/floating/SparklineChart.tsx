import { createEffect, onCleanup, onMount } from "solid-js";

interface SparklineProps {
    data: number[];
    color: string;
    width: number;
    height: number;
}

export default function SparklineChart(props: SparklineProps) {
    let canvasRef: HTMLCanvasElement | undefined;
    let animFrame: number;
    let ctx: CanvasRenderingContext2D | null = null;

    function getCtx(): CanvasRenderingContext2D | null {
        if (!ctx && canvasRef) {
            ctx = canvasRef.getContext("2d", { alpha: true });
        }
        return ctx;
    }

    function draw(data: number[], progress = 1) {
        const context = getCtx();
        if (!context || !canvasRef) return;

        const w = props.width;
        const h = props.height;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvasRef.width = w * dpr;
        canvasRef.height = h * dpr;
        context.save();
        context.scale(dpr, dpr);

        const max = Math.max(...data, 1);
        const min = Math.min(...data, 0);
        const range = max - min || 1;

        context.clearRect(0, 0, w, h);

        // Draw line
        context.beginPath();
        context.strokeStyle = props.color;
        context.lineWidth = 1.5;
        context.lineCap = "round";
        context.lineJoin = "round";

        const visibleCount = Math.floor(data.length * progress);
        for (let i = 0; i < visibleCount; i++) {
            const x = (i / (data.length - 1)) * w;
            const y = h - ((data[i] - min) / range) * (h - 8) - 4;
            if (i === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        }
        context.stroke();

        // Draw area
        if (visibleCount > 1) {
            context.lineTo(((visibleCount - 1) / (data.length - 1)) * w, h);
            context.lineTo(0, h);
            context.closePath();
            context.fillStyle = props.color + "18";
            context.fill();
        }

        // Draw dot at end
        if (visibleCount > 0) {
            const lastIdx = visibleCount - 1;
            const x = (lastIdx / (data.length - 1)) * w;
            const y = h - ((data[lastIdx] - min) / range) * (h - 8) - 4;
            context.beginPath();
            context.arc(x, y, 2, 0, Math.PI * 2);
            context.fillStyle = props.color;
            context.fill();
        }

        context.restore();
    }

    onMount(() => {
        if (!canvasRef) return;
        // Animate in
        const startTime = performance.now();
        const duration = 800;

        function animate(now: number) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            draw(props.data, eased);
            if (progress < 1) {
                animFrame = requestAnimationFrame(animate);
            }
        }

        animFrame = requestAnimationFrame(animate);
    });

    createEffect(() => {
        draw(props.data);
    });

    onCleanup(() => {
        if (animFrame) cancelAnimationFrame(animFrame);
        ctx = null;
    });

    return (
        <canvas
            ref={canvasRef}
            style={{ width: `${props.width}px`, height: `${props.height}px` }}
        />
    );
}
