import { createEffect, createSignal } from 'solid-js';
import { fmt } from '../../scripts/lib/utils';
import AnimatedNumber from '../common/AnimatedNumber';

interface StatCardProps {
  label: string;
  value: number | string;
  color: string;
  icon?: string;
  featured?: boolean;
  trend?: string;
}

export default function StatCard(props: StatCardProps) {
  const isNumber = () => typeof props.value === 'number';

  return (
    <div class="stat-card" classList={{ featured: props.featured }} style={{ '--card-color': props.color }}>
      <div class="stat-label">{props.label}</div>
      <div class="stat-value" style={{ color: props.color }}>
        {isNumber() ? (
          <AnimatedNumber
            value={props.value as number}
            format={true}
            color={props.color}
          />
        ) : (
          props.value
        )}
      </div>
      {props.trend && (
        <div class="stat-trend">{props.trend}</div>
      )}
    </div>
  );
}
