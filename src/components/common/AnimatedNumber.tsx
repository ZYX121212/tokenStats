import { createSignal, createEffect, onCleanup } from "solid-js";
import { fmt } from "../../scripts/lib/utils";

interface AnimatedNumberProps {
    value: number;
    duration?: number;
    format?: boolean;
    color?: string;
}

export default function AnimatedNumber(props: AnimatedNumberProps) {
    const [displayValue, setDisplayValue] = createSignal(props.value);
    let animFrame: number;
    let startTime: number;
    let startValue = props.value;
    let targetValue = props.value;
    let lastFinishedValue = props.value;

    const duration = () => props.duration ?? 600;

    function easeOutQuart(t: number): number {
        return 1 - Math.pow(1 - t, 4);
    }

    function animate(now: number) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration(), 1);
        const eased = easeOutQuart(progress);
        const current = startValue + (targetValue - startValue) * eased;
        setDisplayValue(current);

        if (progress < 1) {
            animFrame = requestAnimationFrame(animate);
        } else {
            lastFinishedValue = targetValue;
        }
    }

    createEffect(() => {
        const newValue = props.value;
        if (newValue === targetValue) return;

        // Start from the last fully-completed value, not a mid-animation value
        startValue = lastFinishedValue;
        targetValue = newValue;
        startTime = performance.now();

        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = requestAnimationFrame(animate);
    });

    onCleanup(() => {
        if (animFrame) cancelAnimationFrame(animFrame);
    });

    const formatted = () => {
        const val = displayValue();
        if (props.format) return fmt(Math.round(val));
        return String(Math.round(val));
    };

    return <span style={{ color: props.color }}>{formatted()}</span>;
}
