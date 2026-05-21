import { createSignal, onMount, onCleanup, For } from "solid-js";

interface KeyboardShortcut {
    key: string;
    description: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    alt?: boolean;
}

const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
    { key: "?", description: "显示/隐藏快捷键帮助" },
    { key: "1", ctrl: true, description: "切换到概览页面" },
    { key: "2", ctrl: true, description: "切换到统计页面" },
    { key: "3", ctrl: true, description: "切换到日志页面" },
    { key: "4", ctrl: true, description: "切换到设置页面" },
    { key: "r", ctrl: true, description: "刷新数据" },
    { key: "t", description: "切换主题" },
    { key: "f", ctrl: true, description: "搜索/筛选" },
    { key: "Escape", description: "关闭菜单/对话框" },
];

export default function KeyboardHint() {
    const [showHelp, setShowHelp] = createSignal(false);

    const formatKey = (shortcut: KeyboardShortcut) => {
        const keys: string[] = [];

        if (shortcut.ctrl || shortcut.meta) {
            keys.push(navigator.platform.includes("Mac") ? "⌘" : "Ctrl");
        }
        if (shortcut.shift) keys.push("⇧");
        if (shortcut.alt) keys.push("Alt");

        let displayKey = shortcut.key;
        if (shortcut.key === "Escape") displayKey = "Esc";
        if (shortcut.key === " ") displayKey = "Space";

        keys.push(displayKey);
        return keys;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            setShowHelp(!showHelp());
        }
    };

    onMount(() => {
        document.addEventListener("keydown", handleKeyDown);
    });

    onCleanup(() => {
        document.removeEventListener("keydown", handleKeyDown);
    });

    return (
        <>
            <button
                class="keyboard-hint-btn"
                onClick={() => setShowHelp(!showHelp())}
                data-tooltip="按 ? 查看快捷键"
            >
                <span class="key-icon">⌨️</span>
            </button>

            {showHelp() && (
                <div
                    class="keyboard-help-overlay"
                    onClick={() => setShowHelp(false)}
                >
                    <div
                        class="keyboard-help-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div class="keyboard-help-header">
                            <h3>键盘快捷键</h3>
                            <button
                                class="keyboard-help-close"
                                onClick={() => setShowHelp(false)}
                            >
                                ✕
                            </button>
                        </div>
                        <div class="keyboard-help-content">
                            <For each={DEFAULT_SHORTCUTS}>
                                {(shortcut) => (
                                    <div class="keyboard-shortcut-item">
                                        <div class="keyboard-keys">
                                            <For each={formatKey(shortcut)}>
                                                {(key) => (
                                                    <kbd class="keyboard-key">
                                                        {key}
                                                    </kbd>
                                                )}
                                            </For>
                                        </div>
                                        <span class="keyboard-description">
                                            {shortcut.description}
                                        </span>
                                    </div>
                                )}
                            </For>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
