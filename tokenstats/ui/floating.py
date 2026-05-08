from typing import Callable, Optional

from PyQt5.QtCore import QPoint, Qt, QTimer
from PyQt5.QtWidgets import QApplication, QLabel, QMenu, QMessageBox, QVBoxLayout, QWidget

from ..config import AppConfig, save_config
from ..storage import TokenStore
from ..themes import ThemeManager


class FloatingWindow(QWidget):
    def __init__(
        self,
        config: AppConfig,
        store: TokenStore,
        on_settings_saved,
        on_open_stats: Callable[[], None],
    ) -> None:
        super().__init__()
        self.config = config
        self.store = store
        self.on_settings_saved = on_settings_saved
        self.on_open_stats = on_open_stats
        self._drag_pos = QPoint()
        self._is_alerting = False
        
        # 主题管理器
        self.theme_manager = ThemeManager()
        self.theme_manager.add_listener(self._on_theme_changed)

        self.setWindowTitle("TokenStats")
        self._apply_window_flags()
        self.setAttribute(Qt.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WA_ShowWithoutActivating, True)
        self.setWindowOpacity(self.config.opacity)

        self.title = QLabel("TokenStats")
        self.title.setObjectName("title")
        self.current = QLabel("当前模型: -")
        self.current.setObjectName("current")
        self.five_min = QLabel("5分钟: 0")
        self.today = QLabel("今日: 0")
        self.total = QLabel("累计: 0")

        layout = QVBoxLayout()
        layout.setContentsMargins(12, 10, 12, 10)
        layout.setSpacing(5)
        layout.addWidget(self.title)
        layout.addWidget(self.current)
        layout.addWidget(self.five_min)
        layout.addWidget(self.today)
        layout.addWidget(self.total)
        self.setLayout(layout)

        self.setFixedWidth(self.config.floating_width)
        self._apply_theme()
        
        self._tray_icon: Optional = None
        self._notification_sent = False
        self._last_alert_state = False

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh)
        self.timer.start(1000)
        self.refresh()

    def set_tray_icon(self, tray_icon) -> None:
        """设置系统托盘图标用于发送通知"""
        self._tray_icon = tray_icon

    def refresh(self) -> None:
        snap = self.store.snapshot()
        five = int(snap["five_min_tokens"])
        total = int(snap["total_tokens"])
        today = int(snap["today_tokens"])
        last = snap["last"]
        current = snap["current_model"]
        self._is_alerting = five >= self.config.alert_threshold_5m

        if current:
            self.current.setText(f"当前模型: {current['model']}")
        elif last:
            self.current.setText(f"当前模型: {last['model']} (最近)")
        else:
            self.current.setText("当前模型: -")
        self.five_min.setText(f"5分钟: {five:,} tokens")
        self.today.setText(f"今日: {today:,} tokens")
        self.total.setText(f"累计: {total:,} tokens")
        self._apply_theme()
        
        # 检查是否需要发送通知
        if self._is_alerting and not self._last_alert_state and not self._notification_sent:
            self._send_threshold_notification(five)
            self._notification_sent = True
        elif not self._is_alerting and self._last_alert_state:
            pass
        else:
            self._notification_sent = False
        
        self._last_alert_state = self._is_alerting

    def _send_threshold_notification(self, five_min_tokens: int) -> None:
        """发送阈值预警通知"""
        if self._tray_icon:
            message = f"⚠️ Token 消耗预警！\n"
            message += f"5分钟内已使用 {five_min_tokens:,} tokens\n"
            message += f"预警阈值: {self.config.alert_threshold_5m:,} tokens"
            self._tray_icon.showMessage(
                "TokenStats 预警",
                message,
                QSystemTrayIcon.Warning,
                10000
            )

    def contextMenuEvent(self, event) -> None:
        menu = QMenu(self)
        
        # 应用主题
        theme = self.theme_manager.current_theme
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
        
        stats = menu.addAction("详细统计")
        stats.triggered.connect(self.on_open_stats)
        settings = menu.addAction("设置")
        settings.triggered.connect(self.open_settings)
        clear = menu.addAction("清空统计")
        clear.triggered.connect(self.clear_stats)
        menu.addSeparator()
        quit_action = menu.addAction("退出")
        quit_action.triggered.connect(QApplication.instance().quit)
        menu.exec_(event.globalPos())

    def mousePressEvent(self, event) -> None:
        if event.button() == Qt.LeftButton and not self.config.lock_position:
            self._drag_pos = event.globalPos() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event) -> None:
        if event.buttons() & Qt.LeftButton and not self.config.lock_position:
            self.move(event.globalPos() - self._drag_pos)
            event.accept()

    def mouseReleaseEvent(self, event) -> None:
        if event.button() == Qt.LeftButton and not self.config.lock_position:
            self.config.window_x = self.x()
            self.config.window_y = self.y()
            save_config(self.config)
            event.accept()

    def open_settings(self) -> None:
        from .settings import SettingsDialog
        dialog = SettingsDialog(self.config, self.store, self)
        if dialog.exec_() == QApplication.instance().activeModalWidget().Accepted:
            save_config(self.config)
            self.setWindowOpacity(self.config.opacity)
            self._apply_window_flags()
            self.on_settings_saved()
            self.refresh()

    def clear_stats(self) -> None:
        reply = QMessageBox.question(
            self,
            "确认清空",
            "确定要清空所有统计数据吗？此操作不可恢复。",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        if reply == QMessageBox.Yes:
            self.store.clear()
            self.refresh()
            QMessageBox.information(self, "成功", "统计数据已清空。")

    def mouseDoubleClickEvent(self, event) -> None:
        if event.button() == Qt.LeftButton:
            self.on_open_stats()
            event.accept()

    def _apply_theme(self) -> None:
        """应用当前主题"""
        theme = self.theme_manager.current_theme
        alert = self._is_alerting
        
        if alert:
            bg = theme.floating_alert_bg
            border = theme.floating_alert_border
        else:
            bg = theme.floating_bg
            border = theme.floating_border
        
        self.setStyleSheet(f"""
            QWidget {{
                background: {bg};
                color: {theme.floating_fg};
                border: 1px solid {border};
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
                color: {theme.primary};
            }}
            QLabel#current {{
                font-size: 13px;
                font-weight: 700;
                color: {theme.text_primary};
            }}
        """)

    def _on_theme_changed(self, theme) -> None:
        """主题变更回调"""
        self._apply_theme()

    def show_floating(self) -> None:
        self.show()

    def _apply_window_flags(self) -> None:
        was_visible = self.isVisible()
        flags = Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus | Qt.Window
        if self.config.always_on_top:
            flags |= Qt.WindowStaysOnTopHint
        self.setWindowFlags(flags)
        if was_visible:
            self.show()

    def closeEvent(self, event) -> None:
        """清理资源"""
        self.theme_manager.remove_listener(self._on_theme_changed)
        super().closeEvent(event)
