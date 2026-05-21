import { createSignal, onCleanup, onMount } from 'solid-js';
import { state } from '../../stores/mainStore';
import { formatTimeAgo } from '../../scripts/lib/utils';

export default function RefreshIndicator() {
  const [timeAgo, setTimeAgo] = createSignal(formatTimeAgo(state.lastRefresh));

  let interval: ReturnType<typeof setInterval>;

  onMount(() => {
    interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(state.lastRefresh));
    }, 10000);
  });

  onCleanup(() => {
    if (interval) clearInterval(interval);
  });

  return (
    <div class="refresh-indicator" title="数据最后刷新时间">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 16h5v5" />
      </svg>
      <span class="refresh-text">{timeAgo()}</span>
    </div>
  );
}
