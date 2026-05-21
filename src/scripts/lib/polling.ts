export interface PollingConfig {
  fastInterval: number;
  slowInterval: number;
  idleInterval: number;
  noChangeThreshold: number;
}

export interface PollingCallbacks {
  onPoll: () => Promise<boolean>;
  onVisibilityChange?: (hidden: boolean) => void;
}

export interface PollingHandle {
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function createSmartPolling(
  config: PollingConfig,
  callbacks: PollingCallbacks,
): PollingHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let currentInterval = config.fastInterval;
  let noChangeCount = 0;
  let running = false;
  let visibilityListener: (() => void) | null = null;

  function schedule(): void {
    if (timer) clearTimeout(timer);
    if (!running) return;
    timer = setTimeout(async () => {
      try {
        const changed = await callbacks.onPoll();
        if (changed) {
          noChangeCount = 0;
          currentInterval = config.fastInterval;
        } else {
          noChangeCount++;
          if (
            noChangeCount >= config.noChangeThreshold &&
            currentInterval !== config.slowInterval
          ) {
            currentInterval = config.slowInterval;
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
      schedule();
    }, currentInterval);
  }

  // Internal: pause polling without touching the visibility listener
  function pause(): void {
    running = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    schedule();
  }

  // Public stop: pause + remove the visibility listener (full teardown)
  function stop(): void {
    pause();
    if (visibilityListener && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", visibilityListener);
      visibilityListener = null;
    }
  }

  function reset(): void {
    pause();
    noChangeCount = 0;
    currentInterval = config.fastInterval;
  }

  function handleVisibilityChange(): void {
    if (document.hidden) {
      pause(); // Only pause — keep the listener alive so we can resume
    } else {
      noChangeCount = 0;
      currentInterval = config.fastInterval;
      callbacks.onVisibilityChange?.(false);
      start();
    }
  }

  if (typeof document !== "undefined") {
    visibilityListener = handleVisibilityChange;
    document.addEventListener("visibilitychange", visibilityListener);
  }

  return { start, stop, reset };
}
