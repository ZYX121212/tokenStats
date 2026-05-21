import AnimatedNumber from "../common/AnimatedNumber";

interface StatCardProps {
    label: string;
    value: number | string;
    color: string;
    icon?: string;
    featured?: boolean;
    trend?: string;
}

export default function StatCard(props: StatCardProps) {
    // 更安全地检查是否是数字
    const isNumericValue = (val: any): val is number => {
        return typeof val === "number" && !isNaN(val) && isFinite(val);
    };

    const displayValue = () => {
        if (isNumericValue(props.value)) {
            return (
                <AnimatedNumber
                    value={props.value}
                    format={true}
                    color={props.color}
                />
            );
        }
        // 如果不是数字，直接显示字符串
        return String(props.value ?? "-");
    };

    return (
        <div
            class="stat-card"
            classList={{ featured: props.featured }}
            style={{ "--card-color": props.color }}
        >
            <div class="stat-label">{props.label}</div>
            <div class="stat-value" style={{ color: props.color }}>
                {displayValue()}
            </div>
            {props.trend && <div class="stat-trend">{props.trend}</div>}
        </div>
    );
}
