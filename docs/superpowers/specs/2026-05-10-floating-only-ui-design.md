# Floating-Only UI Design

## Goal

Optimize TokenStats UI so the app launches with only the floating window visible. All functionality is accessible through the floating window's right-click context menu.

## Changes

### 1. Startup: Hide Main Window

- Set `visible: false` on the main window in `tauri.conf.json`
- The floating window shows on startup as before
- Main window opens only when user triggers it from the context menu

### 2. Context Menu: Flat Layout with Sections

Replace the current 4-item menu with a flat, sectioned menu:

```
── 查看统计 ──────────────
  概览
  统计
  设置
  诊断
── 快捷操作 ──────────────
  导出 CSV
  清理数据
  完整性检查
── 窗口控制 ──────────────
  显示主窗口
  透明度 [slider]
  重置位置
── Provider ──────────────
  (dynamic provider list)
  Mock 模式 [toggle]
──────────────────────────
  关闭
```

- Sections separated by `.menu-separator` lines with section headers
- Transparency slider inline in the menu
- Provider list loaded from `get_providers` command
- Mock mode as a checkbox item

### 3. Menu Implementation Details

- **"查看统计" items**: Each calls `showMainWindow(tabName)` with the tab name to open the main window on that specific tab
- **"快捷操作" items**: `exportCsv`, `cleanupOldData(30)`, `checkDbIntegrity` - execute directly, show toast result
- **"窗口控制"**:
  - "显示主窗口": `showMainWindow()` with no tab
  - Opacity slider: same as current, but embedded in menu
  - "重置位置": reset floating window position
- **"Provider"**:
  - List providers from backend
  - Mock mode toggle: calls `saveSettings` with `mock_mode` flipped
- **"关闭"**: hides the floating window (same as current)

### 4. CSS Updates

- Remove `OpacitySlider` as a standalone component outside the menu
- Style section headers (`.menu-section-title`) as muted, smaller text
- Style checkbox items with a check indicator
- Keep the existing glass-morphism context menu style

### 5. Floating Window Content

Keep the current floating panel content (今日 Token, 5分钟, 累计, sparkline) unchanged. Only the context menu changes.

## Files to Modify

| File | Change |
|------|--------|
| `src-tauri/tauri.conf.json` | Main window `visible: false` |
| `src/components/floating/App.tsx` | Remove OpacitySlider from panel, add new menu handlers |
| `src/components/floating/ContextMenu.tsx` | Rewrite with sectioned flat layout |
| `src/components/floating/OpacitySlider.tsx` | Remove (moved into ContextMenu) |
| `src/styles/floating.css` | Remove standalone opacity slider styles, add section/checkbox styles |
| `src/stores/floatingStore.ts` | Add providers list, mock mode state |
