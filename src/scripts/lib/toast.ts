let toastTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_TOAST_ID = 'toast';
const DEFAULT_SHOW_CLASS = 'visible';
const DEFAULT_WARNING_CLASS = 'warning';
const DEFAULT_DURATION = 2200;

export function showToast(msg: string, elementId?: string, durationMs?: number): void {
    const el = document.getElementById(elementId ?? DEFAULT_TOAST_ID);
    if (!el) return;
    el.textContent = msg;
    el.removeAttribute('tabindex');
    el.classList.remove(DEFAULT_WARNING_CLASS);
    el.classList.add(DEFAULT_SHOW_CLASS);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.classList.remove(DEFAULT_SHOW_CLASS);
    }, durationMs ?? DEFAULT_DURATION);
}

export function showWarningToast(msg: string, elementId?: string): void {
    const el = document.getElementById(elementId ?? DEFAULT_TOAST_ID);
    if (!el) return;
    el.textContent = msg;
    el.removeAttribute('tabindex');
    el.classList.add(DEFAULT_WARNING_CLASS, DEFAULT_SHOW_CLASS);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        el.classList.remove(DEFAULT_WARNING_CLASS, DEFAULT_SHOW_CLASS);
    }, DEFAULT_DURATION + 1000);
}

export function initToastKeyboardHandler(): void {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.toast-msg.visible').forEach(toast => {
                toast.classList.remove('visible', 'warning');
            });
        }
    });
}
