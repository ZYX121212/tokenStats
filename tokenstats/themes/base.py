from dataclasses import dataclass, field
from typing import List


@dataclass
class Theme:
    name: str
    display_name: str
    
    # 悬浮窗颜色
    floating_bg: str = "#f8fafc"
    floating_fg: str = "#0f172a"
    floating_border: str = "#cbd5e1"
    floating_alert_bg: str = "#fee2e2"
    floating_alert_border: str = "#ef4444"
    
    # 对话框颜色
    dialog_bg: str = "#f8fafc"
    dialog_fg: str = "#0f172a"
    card_bg: str = "#ffffff"
    card_border: str = "#e2e8f0"
    
    # 强调色
    primary: str = "#2563eb"
    secondary: str = "#0f172a"
    accent: str = "#60a5fa"
    
    # 图表颜色
    chart_colors: List[str] = field(default_factory=lambda: [
        "#2563eb", "#10b981", "#f59e0b", "#ef4444",
        "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"
    ])
    
    # 文字颜色
    text_primary: str = "#0f172a"
    text_secondary: str = "#64748b"
    text_muted: str = "#94a3b8"
    
    # 状态颜色
    success: str = "#10b981"
    warning: str = "#f59e0b"
    danger: str = "#ef4444"
    info: str = "#3b82f6"
    
    def to_stylesheet(self) -> str:
        """生成悬浮窗的样式表"""
        return f"""
        QWidget {{
            background: {self.floating_bg};
            color: {self.floating_fg};
            border: 1px solid {self.floating_border};
            border-radius: 12px;
            font-size: 13px;
        }}
        QLabel {{
            border: none;
            background: transparent;
        }}
        QLabel#title {{
            font-size: 15px;
            font-weight: 700;
        }}
        QLabel#current {{
            font-size: 13px;
            font-weight: 700;
        }}
        QMenu {{
            border-radius: 4px;
            background: {self.card_bg};
            border: 1px solid {self.card_border};
        }}
        QMenu::item {{
            padding: 6px 20px;
        }}
        QMenu::item:selected {{
            background: {self.primary};
            color: white;
        }}
        """
    
    def to_dialog_stylesheet(self) -> str:
        """生成对话框的样式表"""
        return f"""
        QDialog {{
            background: {self.dialog_bg};
            color: {self.dialog_fg};
        }}
        QLabel#dialogTitle {{
            font-size: 22px;
            font-weight: 700;
            color: {self.text_primary};
        }}
        QLabel#dialogSubtitle {{
            color: {self.text_secondary};
            font-size: 12px;
        }}
        QFrame#filterBar, QFrame#summaryCard {{
            background: {self.card_bg};
            border: 1px solid {self.card_border};
            border-radius: 8px;
        }}
        QLabel#summaryTitle {{
            color: {self.text_secondary};
            font-size: 12px;
        }}
        QLabel#summaryValue {{
            color: {self.text_primary};
            font-size: 18px;
            font-weight: 700;
        }}
        QComboBox, QLineEdit, QSpinBox, QDoubleSpinBox {{
            min-height: 30px;
            border: 1px solid {self.card_border};
            border-radius: 6px;
            padding: 4px 8px;
            background: {self.card_bg};
        }}
        QTableWidget {{
            background: {self.card_bg};
            alternate-background-color: {self.dialog_bg};
            border: 1px solid {self.card_border};
            border-radius: 8px;
        }}
        QHeaderView::section {{
            background: {self.dialog_bg};
            color: {self.text_primary};
            border: none;
            border-bottom: 1px solid {self.card_border};
            padding: 8px;
            font-weight: 700;
        }}
        QPushButton {{
            min-height: 30px;
            border-radius: 6px;
            padding: 5px 14px;
            border: 1px solid {self.card_border};
            background: {self.card_bg};
        }}
        QPushButton#primaryButton {{
            background: {self.primary};
            color: #ffffff;
            border: 1px solid {self.primary};
            font-weight: 700;
        }}
        QPushButton#secondaryButton {{
            background: {self.secondary};
            color: #ffffff;
            border: 1px solid {self.secondary};
        }}
        QGroupBox#panelGroup, QGroupBox#providerCard {{
            background: {self.card_bg};
            border: 1px solid {self.card_border};
            border-radius: 8px;
            margin-top: 14px;
            font-weight: 700;
        }}
        QGroupBox#panelGroup::title, QGroupBox#providerCard::title {{
            subcontrol-origin: margin;
            left: 14px;
            padding: 0 6px;
            color: {self.text_primary};
            background: {self.dialog_bg};
        }}
        QTabBar::tab {{
            background: {self.dialog_bg};
            color: {self.text_secondary};
            padding: 9px 18px;
            border-radius: 7px;
            margin-right: 6px;
        }}
        QTabBar::tab:selected {{
            background: {self.primary};
            color: #ffffff;
            font-weight: 700;
        }}
        QCheckBox::indicator:checked {{
            background: {self.primary};
            border: 1px solid {self.primary};
        }}
        """
