import { onCleanup, onMount } from 'solid-js';
import { createSmartPolling as createPolling, type PollingConfig, type PollingCallbacks } from '../scripts/lib/polling';

export function useSmartPolling(config: PollingConfig, callbacks: PollingCallbacks) {
  let handle: ReturnType<typeof createPolling> | null = null;

  onMount(() => {
    handle = createPolling(config, callbacks);
    handle.start();
  });

  onCleanup(() => {
    handle?.stop();
  });

  return {
    start: () => handle?.start(),
    stop: () => handle?.stop(),
    reset: () => handle?.reset(),
  };
}
