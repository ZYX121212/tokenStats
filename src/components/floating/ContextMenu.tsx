import {
    onCleanup,
    onMount,
    Show,
    For,
    createSignal,
    createEffect,
} from "solid-js";
import { Portal } from "solid-js/web";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { state, closeMenu } from "../../stores/floatingStore";

const PANEL_W = 336;
const PANEL_H = 176;

interface ContextMenuProps {
    onShowTab: (tab: string) => void;
    onShowMain: () => void;
    onExport: () => void;
    onCleanup: () => void;
    onIntegrityCheck: () => void;
    onResetPos: () => void;
    onClose: () => void;
    onToggleMock: () => void;
    onOpacityChange: (value: number) => void;
}

async function expandWindow(menuScrollH: number) {
    const neededH = PANEL_H + menuScrollH + 32;
    try {
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(PANEL_W, neededH));
        await new Promise<void>((r) => setTimeout(r, 80));
    } catch (e) {
        console.error("[Menu] expandWindow failed:", e);
    }
}

async function restoreWindow() {
    try {
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(PANEL_W, PANEL_H));
    } catch (e) {
        console.error("[Menu] restoreWindow failed:", e);
    }
}

export default function ContextMenu(props: ContextMenuProps) {
    let menuRef: HTMLDivElement | undefined;
    const [pos, setPos] = createSignal({ x: 0, y: 0 });
    const [ready, setReady] = createSignal(false);
    const [focusIndex, setFocusIndex] = createSignal(-1);

    // Restore window size & reset visibility when menu closes
    createEffect(() => {
        if (!state.menuOpen) {
            setReady(false);
            setFocusIndex(-1);
            document.documentElement.style.overflow = "hidden";
            document.body.style.overflow = "hidden";
            void restoreWindow();
        } else {
            document.documentElement.style.overflow = "visible";
            document.body.style.overflow = "visible";
        }
    });

    function getMenuItems(): HTMLElement[] {
        if (!menuRef) return [];
        return Array.from(
            menuRef.querySelectorAll('[role="menuitem"]'),
        ) as HTMLElement[];
    }

    onMount(() => {
        const handleMouseDownOutside = (e: MouseEvent) => {
            if (menuRef && !menuRef.contains(e.target as Node)) {
                closeMenu();
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeMenu();
                return;
            }
            const items = getMenuItems();
            if (items.length === 0) return;

            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setFocusIndex((prev) => {
                    const next =
                        e.key === "ArrowDown"
                            ? (prev + 1) % items.length
                            : (prev - 1 + items.length) % items.length;
                    items[next]?.focus();
                    return next;
                });
            } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const idx = focusIndex();
                if (idx >= 0 && idx < items.length) {
                    items[idx]?.click();
                }
            }
        };
        document.addEventListener("mousedown", handleMouseDownOutside, true);
        document.addEventListener("keydown", handleKeyDown);
        onCleanup(() => {
            document.removeEventListener(
                "mousedown",
                handleMouseDownOutside,
                true,
            );
            document.removeEventListener("keydown", handleKeyDown);
        });
    });

    function handleMenuClick(e: MouseEvent) {
        e.stopPropagation();
    }

    async function executeAction(action: () => void) {
        action();
        await new Promise<void>((r) => setTimeout(r, 0));
        closeMenu();
    }

    function handleRef(el: HTMLDivElement) {
        menuRef = el;
        if (!el) return;

        void (async () => {
            await new Promise<void>((r) => requestAnimationFrame(() => r()));

            const menuH = el.scrollHeight;
            await expandWindow(menuH);

            await new Promise<void>((r) => requestAnimationFrame(() => r()));

            const rect = el.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let x = state.menuPos.x;
            let y = state.menuPos.y + 4;

            if (x + rect.width > vw - 8) x = vw - rect.width - 8;
            if (x < 8) x = 8;
            if (y + rect.height > vh - 8) y = vh - rect.height - 8;
            if (y < 8) y = 8;

            setPos({ x, y });
            setReady(true);
        })();
    }

    return (
        <Show when={state.menuOpen}>
            <Portal mount={document.body}>
                <div
                    ref={handleRef}
                    class="context-menu"
                    style={{
                        position: "fixed",
                        left: `${pos().x}px`,
                        top: `${pos().y}px`,
                        "z-index": "2147483647",
                        opacity: ready() ? "1" : "0",
                        visibility: ready() ? "visible" : "hidden",
                    }}
                    role="menu"
                    onClick={handleMenuClick}
                >
                    <div class="menu-section-title">查看统计</div>
                    <div
                        class="menu-item"
                        role="menuitem"
                        tabindex={focusIndex() === 0 ? 0 : -1}
                        onClick={() =>
                            executeAction(() => props.onShowTab("overview"))
                        }
                    >
                        概览
                    </div>
                    <div
                        class="menu-item"
                        role="menuitem"
                        tabindex={focusIndex() === 1 ? 0 : -1}
                        onClick={() =>
                            executeAction(() => props.onShowTab("statistics"))
                        }
                    >
                        统计
                    </div>
                    <div
                        class="menu-item"
                        role="menuitem"
                        tabindex={focusIndex() === 2 ? 0 : -1}
                        onClick={() =>
                            executeAction(() => props.onShowTab("settings"))
                        }
                    >
                        设置
                    </div>
                    <div
                        class="menu-item"
                        role="menuitem"
                        tabindex={focusIndex() === 3 ? 0 : -1}
                        onClick={() =>
                            executeAction(() => props.onShowTab("diagnostics"))
                        }
                    >
                        诊断
                    </div>

                    <div class="menu-separator" />

                    <div class="menu-section-title">快捷操作</div>
                    <div
                        class="menu-item"
                        role="menuitem"
                        tabindex={focusIndex() === 4 ? 0 : -1}
                        onClick={() => executeAction(() => props.onExport())}
                    >
                        导出 CSV
                    </div>
                    <div
                        class="menu-item"
                        role="menuitem"
                        tabindex={focusIndex() === 5 ? 0 : -1}
                        onClick={() => executeAction(() => props.onCleanup())}
                    >
                        清理数据
                    </div>
                    <div
                        class="menu-item"
                        role="menuitem"
                        tabindex={focusIndex() === 6 ? 0 : -1}
                        onClick={() =>
                            executeAction(() => props.onIntegrityCheck())
                        }
                    >
                        完整性检查
                    </div>

                    <div class="menu-separator" />

                    <div class="menu-section-title">窗口控制</div>
                    <div
                        class="menu-item"
                        role="menuitem"
                        tabindex={focusIndex() === 7 ? 0 : -1}
                        onClick={() => executeAction(() => props.onShowMain())}
                    >
                        显示主窗口
                    </div>
                    <div class="menu-opacity-row">
                        <span class="menu-opacity-label">透明度</span>
                        <input
                            type="range"
                            class="menu-opacity-slider"
                            min="0.1"
                            max="1"
                            step="0.01"
                            value={state.opacity}
                            onInput={(e) =>
                                props.onOpacityChange(
                                    parseFloat(e.currentTarget.value),
                                )
                            }
                        />
                        <span class="menu-opacity-value">
                            {Math.round(state.opacity * 100)}%
                        </span>
                    </div>
                    <div
                        class="menu-item"
                        role="menuitem"
                        tabindex={focusIndex() === 8 ? 0 : -1}
                        onClick={() => executeAction(() => props.onResetPos())}
                    >
                        重置位置
                    </div>

                    <div class="menu-separator" />

                    <div class="menu-section-title">Provider</div>
                    <Show
                        when={state.providers.length > 0}
                        fallback={
                            <div class="menu-item menu-item-muted">
                                无已配置 Provider
                            </div>
                        }
                    >
                        <For each={state.providers}>
                            {(provider) => (
                                <div class="menu-item menu-item-muted">
                                    {provider}
                                </div>
                            )}
                        </For>
                    </Show>
                    <div
                        class="menu-item menu-item-toggle"
                        role="menuitem"
                        tabindex={focusIndex() === 9 ? 0 : -1}
                        onClick={() =>
                            executeAction(() => props.onToggleMock())
                        }
                    >
                        <span class="toggle-indicator">
                            {state.mockMode ? "●" : "○"}
                        </span>
                        Mock 模式
                    </div>

                    <div class="menu-separator" />

                    <div
                        class="menu-item menu-item-danger"
                        role="menuitem"
                        tabindex={focusIndex() === 10 ? 0 : -1}
                        onClick={() => executeAction(() => props.onClose())}
                    >
                        关闭
                    </div>
                </div>
            </Portal>
        </Show>
    );
}
