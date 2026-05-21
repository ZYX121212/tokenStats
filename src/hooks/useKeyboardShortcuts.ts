import { onMount, onCleanup } from 'solid-js';

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: (e: KeyboardEvent) => void;
  preventDefault?: boolean;
  description?: string;
  enabled?: boolean;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const isInputElement = (element: Element | null): boolean => {
    if (!element) return false;
    const tagName = element.tagName.toLowerCase();
    return ['input', 'textarea', 'select'].includes(tagName) || 
           element.getAttribute('contenteditable') === 'true';
  };

  const matchesShortcut = (e: KeyboardEvent, shortcut: ShortcutConfig): boolean => {
    const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase() || 
                     e.code === shortcut.key;
    const ctrlMatch = !!shortcut.ctrl === (e.ctrlKey || e.metaKey);
    const shiftMatch = !!shortcut.shift === e.shiftKey;
    const altMatch = !!shortcut.alt === e.altKey;

    return keyMatch && ctrlMatch && shiftMatch && altMatch;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isInputElement(e.target as Element)) {
      return;
    }

    for (const shortcut of shortcuts) {
      if (shortcut.enabled === false) {
        continue;
      }

      if (matchesShortcut(e, shortcut)) {
        if (shortcut.preventDefault !== false) {
          e.preventDefault();
        }
        shortcut.handler(e);
        break;
      }
    }
  };

  onMount(() => {
    document.addEventListener('keydown', handleKeyDown, { passive: false });
  });

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown);
  });
}
