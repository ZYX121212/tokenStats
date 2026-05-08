from PyQt5.QtCore import Qt
from PyQt5.QtGui import QColor, QIcon, QPainter, QPixmap
from PyQt5.QtWidgets import QAction, QApplication, QMenu, QSystemTrayIcon

from ..themes import ThemeManager


def make_tray_icon(
    app: QApplication,
    window,
    open_stats,
    open_settings,
) -> QSystemTrayIcon:
    tray = QSystemTrayIcon(_build_icon(), app)
    tray.setToolTip("TokenStats")

    menu = QMenu()
    
    # 应用主题到菜单
    theme_manager = ThemeManager()
    theme = theme_manager.current_theme
    menu.setStyleSheet(f"""
        QMenu {{
            background: {theme.card_bg};
            color: {theme.text_primary};
            border: 1px solid {theme.card_border};
            border-radius: 8px;
            padding: 6px;
        }}
        QMenu::item {{
            padding: 8px 24px;
            border-radius: 4px;
        }}
        QMenu::item:selected {{
            background: {theme.primary};
            color: white;
        }}
        QMenu::separator {{
            height: 1px;
            background: {theme.card_border};
            margin: 6px 12px;
        }}
    """)
    
    show_action = QAction("显示悬浮窗", menu)
    show_action.triggered.connect(window.show_floating)
    stats_action = QAction("详细统计", menu)
    stats_action.triggered.connect(open_stats)
    settings_action = QAction("设置", menu)
    settings_action.triggered.connect(open_settings)
    quit_action = QAction("退出", menu)
    quit_action.triggered.connect(app.quit)

    menu.addAction(show_action)
    menu.addAction(stats_action)
    menu.addAction(settings_action)
    menu.addSeparator()
    menu.addAction(quit_action)
    tray.setContextMenu(menu)
    tray.activated.connect(
        lambda reason: open_stats()
        if reason == QSystemTrayIcon.DoubleClick
        else None
    )
    tray.show()
    return tray


def _build_icon() -> QIcon:
    pixmap = QPixmap(64, 64)
    pixmap.fill(Qt.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.Antialiasing)
    
    # 使用主题色
    theme_manager = ThemeManager()
    theme = theme_manager.current_theme
    
    painter.setBrush(QColor(theme.secondary))
    painter.setPen(QColor(theme.accent))
    painter.drawRoundedRect(6, 6, 52, 52, 12, 12)
    painter.setPen(QColor(theme.floating_bg))
    painter.drawText(pixmap.rect(), Qt.AlignCenter, "TS")
    painter.end()
    return QIcon(pixmap)
