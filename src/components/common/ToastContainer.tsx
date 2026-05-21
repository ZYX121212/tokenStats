import { For, onMount } from 'solid-js';
import { state, removeToast } from '../../stores/mainStore';

export default function ToastContainer() {
  return (
    <div class="toast-container" aria-live="polite" aria-atomic="true">
      <For each={state.toasts}>
        {(toast) => (
          <div
            ref={(el) => {
              requestAnimationFrame(() => el.classList.add('show'));
            }}
            class={`toast-msg ${toast.type === 'warning' ? 'warning' : ''}`}
            role="alert"
            onClick={() => removeToast(toast.id)}
          >
            {toast.text}
          </div>
        )}
      </For>
    </div>
  );
}
