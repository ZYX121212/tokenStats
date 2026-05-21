import { onMount, onCleanup } from "solid-js";
import { createSmartPolling } from "../scripts/lib/polling";

interface UseAutoRefreshOptions {
  interval?: number;
  onRefresh: () => Promise<void>;
  enabled?: boolean;
}

export function useAutoRefresh(options: UseAutoRefreshOptions) {
  let pollingHandle: ReturnType<typeof createSmartPolling> | null = null;

  onMount(() => {
    if (options.enabled === false) return;

    pollingHandle = createSmartPolling(
      {
        fastInterval: options.interval ?? 30000,
        slowInterval: (options.interval ?? 30000) * 2,
        idleInterval: (options.interval ?? 30000) * 4,
        noChangeThreshold: 3,
      },
      {
        onPoll: async () => {
          try {
            await options.onRefresh();
            return true;
          } catch (err) {
            console.error("Auto refresh poll failed:", err);
            return false;
          }
        },
      },
    );

    pollingHandle.start();
  });

  onCleanup(() => {
    pollingHandle?.stop();
  });

  return {
    start: () => pollingHandle?.start(),
    stop: () => pollingHandle?.stop(),
    reset: () => pollingHandle?.reset(),
  };
}
