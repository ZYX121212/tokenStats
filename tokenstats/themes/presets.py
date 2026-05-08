from .base import Theme


# 现代简约（默认）
MODERN_LIGHT = Theme(
    name="modern_light",
    display_name="现代简约",
    floating_bg="#f8fafc",
    floating_fg="#0f172a",
    floating_border="#cbd5e1",
    floating_alert_bg="#fee2e2",
    floating_alert_border="#ef4444",
    dialog_bg="#f8fafc",
    dialog_fg="#0f172a",
    card_bg="#ffffff",
    card_border="#e2e8f0",
    primary="#2563eb",
    secondary="#0f172a",
    accent="#60a5fa",
    text_primary="#0f172a",
    text_secondary="#64748b",
    text_muted="#94a3b8",
    success="#10b981",
    warning="#f59e0b",
    danger="#ef4444",
    info="#3b82f6",
    chart_colors=["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"],
)

# 深色科技
DARK_TECH = Theme(
    name="dark_tech",
    display_name="深色科技",
    floating_bg="#0f172a",
    floating_fg="#e2e8f0",
    floating_border="#1e293b",
    floating_alert_bg="#7f1d1d",
    floating_alert_border="#f87171",
    dialog_bg="#0f172a",
    dialog_fg="#e2e8f0",
    card_bg="#1e293b",
    card_border="#334155",
    primary="#06b6d4",
    secondary="#0ea5e9",
    accent="#22d3ee",
    text_primary="#f1f5f9",
    text_secondary="#94a3b8",
    text_muted="#64748b",
    success="#10b981",
    warning="#f59e0b",
    danger="#ef4444",
    info="#06b6d4",
    chart_colors=["#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#22d3ee", "#84cc16"],
)

# 专业商务
PROFESSIONAL = Theme(
    name="professional",
    display_name="专业商务",
    floating_bg="#ffffff",
    floating_fg="#1e293b",
    floating_border="#d1d5db",
    floating_alert_bg="#fef2f2",
    floating_alert_border="#dc2626",
    dialog_bg="#f9fafb",
    dialog_fg="#1e293b",
    card_bg="#ffffff",
    card_border="#e5e7eb",
    primary="#1e40af",
    secondary="#1e293b",
    accent="#3b82f6",
    text_primary="#111827",
    text_secondary="#4b5563",
    text_muted="#9ca3af",
    success="#059669",
    warning="#d97706",
    danger="#dc2626",
    info="#2563eb",
    chart_colors=["#1e40af", "#059669", "#d97706", "#dc2626", "#7c3aed", "#db2777", "#0891b2", "#65a30d"],
)

# 森林绿
FOREST_GREEN = Theme(
    name="forest_green",
    display_name="森林绿",
    floating_bg="#f0fdf4",
    floating_fg="#14532d",
    floating_border="#86efac",
    floating_alert_bg="#fef2f2",
    floating_alert_border="#ef4444",
    dialog_bg="#f0fdf4",
    dialog_fg="#14532d",
    card_bg="#ffffff",
    card_border="#bbf7d0",
    primary="#15803d",
    secondary="#14532d",
    accent="#4ade80",
    text_primary="#14532d",
    text_secondary="#166534",
    text_muted="#86efac",
    success="#16a34a",
    warning="#ca8a04",
    danger="#dc2626",
    info="#15803d",
    chart_colors=["#15803d", "#16a34a", "#ca8a04", "#dc2626", "#7c3aed", "#db2777", "#0891b2", "#65a30d"],
)

# 海洋蓝
OCEAN_BLUE = Theme(
    name="ocean_blue",
    display_name="海洋蓝",
    floating_bg="#f0f9ff",
    floating_fg="#0c4a6e",
    floating_border="#7dd3fc",
    floating_alert_bg="#fef2f2",
    floating_alert_border="#ef4444",
    dialog_bg="#f0f9ff",
    dialog_fg="#0c4a6e",
    card_bg="#ffffff",
    card_border="#bae6fd",
    primary="#0284c7",
    secondary="#0c4a6e",
    accent="#38bdf8",
    text_primary="#0c4a6e",
    text_secondary="#075985",
    text_muted="#7dd3fc",
    success="#10b981",
    warning="#f59e0b",
    danger="#ef4444",
    info="#0284c7",
    chart_colors=["#0284c7", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"],
)

# 日落橙
SUNSET_ORANGE = Theme(
    name="sunset_orange",
    display_name="日落橙",
    floating_bg="#fff7ed",
    floating_fg="#7c2d12",
    floating_border="#fdba74",
    floating_alert_bg="#fef2f2",
    floating_alert_border="#ef4444",
    dialog_bg="#fff7ed",
    dialog_fg="#7c2d12",
    card_bg="#ffffff",
    card_border="#fed7aa",
    primary="#ea580c",
    secondary="#7c2d12",
    accent="#fb923c",
    text_primary="#7c2d12",
    text_secondary="#9a3412",
    text_muted="#fdba74",
    success="#16a34a",
    warning="#ca8a04",
    danger="#dc2626",
    info="#ea580c",
    chart_colors=["#ea580c", "#16a34a", "#ca8a04", "#dc2626", "#7c3aed", "#db2777", "#0891b2", "#65a30d"],
)

# 预设主题字典
PRESET_THEMES = {
    "modern_light": MODERN_LIGHT,
    "dark_tech": DARK_TECH,
    "professional": PROFESSIONAL,
    "forest_green": FOREST_GREEN,
    "ocean_blue": OCEAN_BLUE,
    "sunset_orange": SUNSET_ORANGE,
}


def get_preset_theme(name: str) -> Theme:
    """获取预设主题，如果不存在则返回默认主题"""
    return PRESET_THEMES.get(name, MODERN_LIGHT)


def get_all_preset_names() -> list:
    """获取所有预设主题名称列表"""
    return [(name, theme.display_name) for name, theme in PRESET_THEMES.items()]
