import { createResource, Show, For } from 'solid-js';
import { state, setState } from '../../stores/mainStore';
import { addToast } from '../../stores/mainStore';
import * as api from '../../scripts/lib/api';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import StatCard from './StatCard';
import Skeleton from '../common/Skeleton';
import type { StatsDto } from '../../types';

const STAT_CONFIG = [
  { key: 'today_tokens', label: '今日 Token', color: '#00d4ff', featured: true, trend: '↑ 18% vs 昨日' },
  { key: 'five_min_tokens', label: '5 分钟', color: '#ffb347' },
  { key: 'total_tokens', label: '累计 Token', color: '#2dd4a8' },
  { key: 'estimated_cost', label: '预估费用', color: '#a78bfa' },
];

export default function OverviewTab() {
  const [stats, { refetch }] = createResource(async () => {
    setState('overview', 'isLoading', true);
    try {
      const data = await api.getStats() as StatsDto;
      setState('overview', 'stats', data as Record<string, string | number>);
      return data;
    } catch (err) {
      addToast('加载概览数据失败', 'warning');
      throw err;
    } finally {
      setState('overview', 'isLoading', false);
    }
  });

  useAutoRefresh({
    interval: 30000,
    onRefresh: async () => {
      await refetch();
    },
  });

  return (
    <div class="tab-panel active" role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
      <div class="stats-grid">
        <Show when={!state.overview.isLoading && state.overview.stats} fallback={<Skeleton rows={4} />}>
          <For each={STAT_CONFIG}>
            {(config) => (
              <StatCard
                label={config.label}
                value={state.overview.stats?.[config.key] ?? '-'}
                color={config.color}
                featured={config.featured}
                trend={config.featured ? config.trend : undefined}
              />
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
