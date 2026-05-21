import { createSignal, createResource } from 'solid-js';

export function useTauriCommand<T>(
  command: () => Promise<T>,
  options?: { initialValue?: T; refetchInterval?: number }
) {
  const [trigger, setTrigger] = createSignal(0);

  const [data, { refetch }] = createResource(trigger, async () => {
    try {
      return await command();
    } catch (err) {
      console.error('Tauri command failed:', err);
      throw err;
    }
  }, {
    initialValue: options?.initialValue,
  });

  const refresh = () => setTrigger((n) => n + 1);

  return { data, refetch, refresh };
}
