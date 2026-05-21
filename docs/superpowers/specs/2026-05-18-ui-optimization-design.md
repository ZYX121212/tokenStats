# UI Optimization Design (2026-05-18)

## Scope

修复 12 个 UI 问题：4 个功能缺陷、4 个代码质量改进、4 个低优先级清理。

## High Priority

### 1. Chart Responsive Widths
- **Problem**: LineChart (700px), PieChart (280px), BarChart (400px) hardcoded widths overflow on resize
- **Fix**: Wrap each chart in a container with `ResizeObserver`, pass measured width as `width` prop

### 2. LogsTab → DataTable
- **Problem**: LogsTab uses hand-built HTML table without sort/search
- **Fix**: Map 7-column log data to DataTable component, use `cellRenderer` for provider badges

### 3. Settings Toggle Switch
- **Problem**: `.toggle-switch` CSS exists but checkbox renders browser default
- **Fix**: In SettingsGroupRenderer `renderInput`, render `<label class="toggle-switch"><input type="checkbox"><span></span></label>` for checkbox type

### 4. SparklineChart Loading State
- **Problem**: Empty chart area when data is null
- **Fix**: Render dashed baseline or skeleton pulse when data is null

## Medium Priority

### 5. Floating Polling → Hook
- **Problem**: FloatingApp uses raw `createSmartPolling` instead of `useSmartPolling`
- **Fix**: Replace with `useSmartPolling` hook, matching main window pattern

### 6. CostBreakdown Total Display
- **Problem**: `total` field in `CostBreakdown` type is never rendered
- **Fix**: Add total row with separator at bottom of cost breakdown section

### 7. Comparison Data Placeholder
- **Problem**: `Math.random()` simulates comparison percentages
- **Fix**: Show "—" with tooltip "Historical comparison data not yet available" instead of fake data

### 8. Mock Data Guards
- **Problem**: Silent fallback to mock data could leak to production
- **Fix**: Add `console.warn` on mock fallback; set a dev mode indicator flag

## Low Priority

### 9. Touch Support for Context Menu
- **Problem**: Right-click context menu has no touch equivalent
- **Fix**: Add long-press (500ms) handler to floating window

### 10. Floating-Only Main Window Config
- **Problem**: `tauri.conf.json` may not hide main window on startup per floating-only spec
- **Fix**: Set main window `visible: false` if not already configured

### 11. Plan Document Checkbox Update
- **Problem**: UI redesign plan shows incomplete tasks that are already implemented
- **Fix**: Mark completed tasks as done in plan doc

### 12. ThemeToggle Sync Verification
- **Problem**: Potential desync between topbar ThemeToggle and settings form
- **Fix**: Verify sync logic, ensure settings save triggers themeStore refresh
