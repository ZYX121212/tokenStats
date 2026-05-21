import { createSignal, JSX } from "solid-js";

interface TooltipData {
    x: number;
    y: number;
    label: string;
    value: number;
    color?: string;
    visible: boolean;
}

interface ChartContainerProps {
    children: JSX.Element;
    width: number;
    height: number;
    onHover?: (x: number, y: number) => TooltipData | null;
    onLeave?: () => void;
}

export default function ChartContainer(props: ChartContainerProps) {
    const [tooltip, setTooltip] = createSignal<TooltipData | null>(null);
    let containerRef: HTMLDivElement | undefined;

    function handleMouseMove(e: MouseEvent) {
        if (!containerRef || !props.onHover) return;
        const rect = containerRef.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const data = props.onHover(x, y);
        if (data && data.visible) {
            setTooltip({
                ...data,
                x: e.clientX + 12,
                y: e.clientY - 12,
            });
        } else {
            setTooltip(null);
        }
    }

    function handleMouseLeave() {
        setTooltip(null);
        props.onLeave?.();
    }

    return (
        <div
            ref={containerRef}
            class="chart-container-wrapper"
            style={{
                width: `${props.width}px`,
                height: `${props.height}px`,
                position: "relative",
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            {props.children}
            {tooltip() && (
                <div
                    class="chart-tooltip visible"
                    style={{
                        left: `${tooltip()!.x}px`,
                        top: `${tooltip()!.y}px`,
                        position: "fixed",
                    }}
                >
                    <div class="tooltip-label">{tooltip()!.label}</div>
                    <div
                        class="tooltip-value"
                        style={{ color: tooltip()!.color || "var(--text)" }}
                    >
                        {tooltip()!.value.toLocaleString()}
                    </div>
                </div>
            )}
        </div>
    );
}
