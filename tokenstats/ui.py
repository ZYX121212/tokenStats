import csv
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, Optional

from PyQt5.QtCore import QPoint, Qt, QTimer
from PyQt5.QtGui import QColor, QIcon, QPainter, QPixmap
from PyQt5.QtWidgets import (
    QAction,
    QAbstractItemView,
    QApplication,
    QCheckBox,
    QComboBox,
    QDialog,
    QDoubleSpinBox,
    QFileDialog,
    QFormLayout,
    QFrame,
    QGridLayout,
    QGroupBox,
    QHeaderView,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMenu,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSpinBox,
    QSystemTrayIcon,
    QTabWidget,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from .config import AppConfig, ProviderConfig, save_config, export_config, import_config
from .storage import TokenStore


def estimate_cost(
    config: AppConfig, model: str, prompt_tokens: int, completion_tokens: int
) -> Optional[float]:
    prices = config.model_prices.get(model)
    if not prices:
        return None
    input_price = float(prices.get("input", 0) or 0)
    output_price = float(prices.get("output", 0) or 0)
    usd = (prompt_tokens / 1_000_000 * input_price) + (
        completion_tokens / 1_000_000 * output_price
    )
    if config.currency == "CNY":
        return usd * config.usd_to_cny
    return usd


def format_cost(config: AppConfig, value: Optional[float]) -> str:
    if value is None:
        return "无单价"
    prefix = "¥" if config.currency == "CNY" else "$"
    return f"{prefix}{value:.4f}"


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

        self.setFixedWidth(220)
        self._apply_theme()
        
        self._tray_icon: Optional[QSystemTrayIcon] = None
        self._notification_sent = False
        self._last_alert_state = False

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh)
        self.timer.start(1000)
        self.refresh()

    def set_tray_icon(self, tray_icon: QSystemTrayIcon) -> None:
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
            # 持续报警状态，不重复发送
            pass
        else:
            # 恢复正常，重置通知标志
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
                10000  # 显示 10 秒
            )

    def contextMenuEvent(self, event) -> None:
        menu = QMenu(self)
        stats = QAction("详细统计", self)
        stats.triggered.connect(self.on_open_stats)
        settings = QAction("设置", self)
        settings.triggered.connect(self.open_settings)
        clear = QAction("清空统计", self)
        clear.triggered.connect(self.clear_stats)
        quit_action = QAction("退出", self)
        quit_action.triggered.connect(QApplication.instance().quit)
        menu.addAction(stats)
        menu.addAction(settings)
        menu.addAction(clear)
        menu.addSeparator()
        menu.addAction(quit_action)
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
        dialog = SettingsDialog(self.config, self.store, self)
        if dialog.exec_() == QDialog.Accepted:
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
        alert = self._is_alerting
        if self.config.theme == "light":
            bg = "#f8fafc" if not alert else "#fee2e2"
            fg = "#0f172a"
            border = "#cbd5e1" if not alert else "#ef4444"
        else:
            bg = "#111827" if not alert else "#7f1d1d"
            fg = "#f9fafb"
            border = "#374151" if not alert else "#f87171"
        self.setStyleSheet(
            f"""
            QWidget {{
                background: {bg};
                color: {fg};
                border: 1px solid {border};
                border-radius: 8px;
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
            }}
            """
        )

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


class StatsDialog(QDialog):
    TIME_RANGES = {
        "最近 5 分钟": 300,
        "最近 1 小时": 3600,
        "今天": "today",
        "最近 7 天": 604800,
        "最近 30 天": 2592000,
        "全部": None,
    }

    def __init__(self, store: TokenStore, config: AppConfig, parent=None) -> None:
        super().__init__(parent)
        self.store = store
        self.config = config
        self.setWindowTitle("TokenStats 详细统计")
        self.setMinimumSize(980, 640)
        self.setObjectName("statsDialog")

        self.time_filter = QComboBox()
        self.time_filter.addItems(self.TIME_RANGES.keys())
        self.provider_filter = QComboBox()
        self.refresh_button = QPushButton("刷新")
        self.refresh_button.setObjectName("secondaryButton")

        title = QLabel("Token 消耗统计")
        title.setObjectName("dialogTitle")
        subtitle = QLabel("按模型、Provider 和时间范围汇总调用消耗")
        subtitle.setObjectName("dialogSubtitle")

        header = QVBoxLayout()
        header.setSpacing(4)
        header.addWidget(title)
        header.addWidget(subtitle)

        filter_bar = QFrame()
        filter_bar.setObjectName("filterBar")
        filter_row = QHBoxLayout()
        filter_row.setContentsMargins(14, 12, 14, 12)
        filter_row.setSpacing(10)
        filter_row.addWidget(QLabel("时间"))
        filter_row.addWidget(self.time_filter)
        filter_row.addWidget(QLabel("Provider"))
        filter_row.addWidget(self.provider_filter)
        filter_row.addStretch(1)
        filter_row.addWidget(self.refresh_button)
        filter_bar.setLayout(filter_row)

        self.calls_card_value = QLabel("0")
        self.tokens_card_value = QLabel("0")
        self.cost_card_value = QLabel("$0.0000")
        self.today_tokens_card_value = QLabel("0")
        self.range_card_value = QLabel("-")
        cards = QGridLayout()
        cards.setSpacing(12)
        cards.addWidget(self._summary_card("调用次数", self.calls_card_value), 0, 0)
        cards.addWidget(self._summary_card("总 Token", self.tokens_card_value), 0, 1)
        cards.addWidget(self._summary_card("今日 Token", self.today_tokens_card_value), 0, 2)
        cards.addWidget(self._summary_card("估算成本", self.cost_card_value), 0, 3)
        cards.addWidget(self._summary_card("统计范围", self.range_card_value), 1, 0, 1, 4)

        self.table = QTableWidget(0, 10)
        self.table.setHorizontalHeaderLabels(
            [
                "模型",
                "Provider",
                "调用",
                "Prompt",
                "Completion",
                "Cached",
                "Total",
                "占比",
                "估算成本",
                "最后调用",
            ]
        )
        self.table.setSortingEnabled(True)
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.verticalHeader().setVisible(False)
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setShowGrid(False)

        buttons = QHBoxLayout()
        export_btn = QPushButton("导出 CSV")
        export_btn.setObjectName("secondaryButton")
        close = QPushButton("关闭")
        close.setObjectName("primaryButton")
        self.refresh_button.clicked.connect(self.refresh)
        export_btn.clicked.connect(self.export_to_csv)
        close.clicked.connect(self.close)
        buttons.addWidget(export_btn)
        buttons.addStretch(1)
        buttons.addWidget(close)

        layout = QVBoxLayout()
        layout.setContentsMargins(22, 20, 22, 18)
        layout.setSpacing(14)
        layout.addLayout(header)
        layout.addWidget(filter_bar)
        layout.addLayout(cards)
        layout.addWidget(self.table)
        layout.addLayout(buttons)
        self.setLayout(layout)
        self._apply_dialog_style()

        self.time_filter.currentTextChanged.connect(self.refresh)
        self.provider_filter.currentTextChanged.connect(self.refresh)
        self.refresh_providers()
        self.refresh()

    def showEvent(self, event) -> None:
        super().showEvent(event)
        self.refresh_providers()
        self.refresh()

    def refresh_providers(self) -> None:
        current = self.provider_filter.currentText()
        self.provider_filter.blockSignals(True)
        self.provider_filter.clear()
        self.provider_filter.addItem("全部")
        self.provider_filter.addItems(self.store.providers())
        index = self.provider_filter.findText(current)
        if index >= 0:
            self.provider_filter.setCurrentIndex(index)
        self.provider_filter.blockSignals(False)

    def refresh(self) -> None:
        since_ts = self._selected_since_ts()
        provider = self.provider_filter.currentText()
        provider_value = None if provider in ("", "全部") else provider
        data = self.store.model_usage_summary(since_ts, provider_value)
        snap = self.store.snapshot()
        total = data["total"]
        rows = data["rows"]
        total_tokens = int(total.get("total_tokens") or 0)
        total_prompt = int(total.get("prompt_tokens") or 0)
        total_completion = int(total.get("completion_tokens") or 0)
        total_calls = int(total.get("calls") or 0)
        today_tokens = int(snap["today_tokens"])

        known_cost = 0.0
        unknown_cost_rows = 0
        for row in rows:
            cost = estimate_cost(
                self.config,
                str(row["model"]),
                int(row["prompt_tokens"] or 0),
                int(row["completion_tokens"] or 0),
            )
            if cost is None:
                unknown_cost_rows += 1
            else:
                known_cost += cost

        cost_text = format_cost(self.config, known_cost)
        if unknown_cost_rows:
            cost_text += f"（{unknown_cost_rows} 项无单价）"
        self.calls_card_value.setText(f"{total_calls:,}")
        self.tokens_card_value.setText(
            f"{total_tokens:,}  P {total_prompt:,} / C {total_completion:,}"
        )
        self.today_tokens_card_value.setText(f"{today_tokens:,}")
        self.cost_card_value.setText(cost_text)
        self.range_card_value.setText(
            f"{self.time_filter.currentText()} · {provider or '全部'}"
        )

        self.table.setSortingEnabled(False)
        self.table.setRowCount(len(rows))
        for row_idx, row in enumerate(rows):
            prompt = int(row["prompt_tokens"] or 0)
            completion = int(row["completion_tokens"] or 0)
            cached = int(row["cached_tokens"] or 0)
            row_total = int(row["total_tokens"] or 0)
            share = (row_total / total_tokens * 100) if total_tokens else 0
            cost = estimate_cost(self.config, str(row["model"]), prompt, completion)
            values = [
                str(row["model"]),
                str(row["provider"]),
                f"{int(row['calls'] or 0):,}",
                f"{prompt:,}",
                f"{completion:,}",
                f"{cached:,}",
                f"{row_total:,}",
                f"{share:.1f}%",
                format_cost(self.config, cost),
                self._format_ts(row.get("last_ts")),
            ]
            for col_idx, value in enumerate(values):
                item = QTableWidgetItem(value)
                if col_idx in (2, 3, 4, 5, 6, 7, 8):
                    item.setTextAlignment(Qt.AlignRight | Qt.AlignVCenter)
                self.table.setItem(row_idx, col_idx, item)
        self.table.resizeColumnsToContents()
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(9, QHeaderView.ResizeToContents)
        self.table.setSortingEnabled(True)

    def _summary_card(self, title: str, value_label: QLabel) -> QFrame:
        card = QFrame()
        card.setObjectName("summaryCard")
        card.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        title_label = QLabel(title)
        title_label.setObjectName("summaryTitle")
        value_label.setObjectName("summaryValue")
        value_label.setWordWrap(True)
        layout = QVBoxLayout()
        layout.setContentsMargins(14, 12, 14, 12)
        layout.setSpacing(6)
        layout.addWidget(title_label)
        layout.addWidget(value_label)
        card.setLayout(layout)
        return card

    def _selected_since_ts(self) -> Optional[float]:
        value = self.TIME_RANGES[self.time_filter.currentText()]
        if value is None:
            return None
        now = time.time()
        if value == "today":
            local = time.localtime(now)
            return time.mktime(
                (
                    local.tm_year,
                    local.tm_mon,
                    local.tm_mday,
                    0,
                    0,
                    0,
                    local.tm_wday,
                    local.tm_yday,
                    local.tm_isdst,
                )
            )
        return now - int(value)

    def _format_ts(self, value) -> str:
        if not value:
            return "-"
        return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(float(value)))

    def export_to_csv(self) -> None:
        """导出当前筛选的统计数据为 CSV 文件"""
        try:
            # 获取当前筛选的数据
            since_ts = self._selected_since_ts()
            provider = self.provider_filter.currentText()
            provider_value = None if provider in ("", "全部") else provider
            data = self.store.model_usage_summary(since_ts, provider_value)
            
            if not data["rows"]:
                QMessageBox.information(self, "提示", "没有数据可导出")
                return
            
            # 生成默认文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            default_filename = f"tokenstats_export_{timestamp}.csv"
            
            # 打开文件保存对话框
            file_path, _ = QFileDialog.getSaveFileName(
                self,
                "导出 CSV",
                default_filename,
                "CSV 文件 (*.csv);;所有文件 (*.*)"
            )
            
            if not file_path:
                return
            
            # 写入 CSV 文件
            with open(file_path, "w", newline="", encoding="utf-8-sig") as csv_file:
                writer = csv.writer(csv_file)
                
                # 写入头部
                headers = [
                    "模型", "Provider", "调用次数", "Prompt Tokens", 
                    "Completion Tokens", "Cached Tokens", "Total Tokens", 
                    "占比", "估算成本", "最后调用时间"
                ]
                writer.writerow(headers)
                
                total_tokens = int(data["total"].get("total_tokens", 0) or 0)
                
                # 写入数据行
                for row in data["rows"]:
                    prompt = int(row.get("prompt_tokens", 0) or 0)
                    completion = int(row.get("completion_tokens", 0) or 0)
                    cached = int(row.get("cached_tokens", 0) or 0)
                    row_total = int(row.get("total_tokens", 0) or 0)
                    share = (row_total / total_tokens * 100) if total_tokens else 0
                    
                    cost = estimate_cost(
                        self.config,
                        str(row["model"]),
                        prompt,
                        completion
                    )
                    cost_str = format_cost(self.config, cost) if cost is not None else "无单价"
                    
                    writer.writerow([
                        str(row["model"]),
                        str(row["provider"]),
                        int(row.get("calls", 0) or 0),
                        prompt,
                        completion,
                        cached,
                        row_total,
                        f"{share:.2f}%",
                        cost_str,
                        self._format_ts(row.get("last_ts"))
                    ])
                
                # 写入汇总行
                writer.writerow([])
                writer.writerow(["汇总", "", int(data["total"].get("calls", 0) or 0),
                               int(data["total"].get("prompt_tokens", 0) or 0),
                               int(data["total"].get("completion_tokens", 0) or 0),
                               int(data["total"].get("cached_tokens", 0) or 0),
                               total_tokens,
                               "100%",
                               "",
                               ""])
            
            QMessageBox.information(self, "成功", f"数据已导出到：\n{file_path}")
            
        except Exception as e:
            QMessageBox.critical(self, "错误", f"导出失败：\n{str(e)}")

    def _apply_dialog_style(self) -> None:
        self.setStyleSheet(
            """
            QDialog#statsDialog {
                background: #f8fafc;
                color: #0f172a;
            }
            QLabel#dialogTitle {
                font-size: 22px;
                font-weight: 700;
                color: #0f172a;
            }
            QLabel#dialogSubtitle {
                color: #64748b;
                font-size: 12px;
            }
            QFrame#filterBar, QFrame#summaryCard {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
            }
            QLabel#summaryTitle {
                color: #64748b;
                font-size: 12px;
            }
            QLabel#summaryValue {
                color: #0f172a;
                font-size: 18px;
                font-weight: 700;
            }
            QComboBox, QLineEdit, QSpinBox, QDoubleSpinBox {
                min-height: 30px;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                padding: 4px 8px;
                background: #ffffff;
            }
            QTableWidget {
                background: #ffffff;
                alternate-background-color: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                selection-background-color: #dbeafe;
                selection-color: #0f172a;
            }
            QHeaderView::section {
                background: #eef2f7;
                color: #334155;
                border: none;
                border-bottom: 1px solid #cbd5e1;
                padding: 8px;
                font-weight: 700;
            }
            QPushButton {
                min-height: 30px;
                border-radius: 6px;
                padding: 5px 14px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
            }
            QPushButton#primaryButton {
                background: #2563eb;
                color: #ffffff;
                border: 1px solid #2563eb;
                font-weight: 700;
            }
            QPushButton#secondaryButton {
                background: #0f172a;
                color: #ffffff;
                border: 1px solid #0f172a;
            }
            """
        )


def make_tray_icon(
    app: QApplication,
    window: FloatingWindow,
    open_stats: Callable[[], None],
    open_settings: Callable[[], None],
) -> QSystemTrayIcon:
    tray = QSystemTrayIcon(_build_icon(), app)
    tray.setToolTip("TokenStats")

    menu = QMenu()
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
    painter.setBrush(QColor("#111827"))
    painter.setPen(QColor("#60a5fa"))
    painter.drawRoundedRect(6, 6, 52, 52, 12, 12)
    painter.setPen(QColor("#f9fafb"))
    painter.drawText(pixmap.rect(), Qt.AlignCenter, "TS")
    painter.end()
    return QIcon(pixmap)


class SettingsDialog(QDialog):
    def __init__(self, config: AppConfig, store=None, parent=None) -> None:
        super().__init__(parent)
        self.config = config
        self.store = store
        self.provider_fields: Dict[str, Dict[str, QWidget]] = {}
        self.price_rows: Dict[str, Dict[str, QDoubleSpinBox]] = {}
        self.setWindowTitle("TokenStats 设置")
        self.setMinimumSize(900, 680)
        self.setObjectName("settingsDialog")

        title = QLabel("设置")
        title.setObjectName("dialogTitle")
        subtitle = QLabel("配置本地代理、悬浮窗显示和各模型服务的上游凭据")
        subtitle.setObjectName("dialogSubtitle")

        header = QVBoxLayout()
        header.setSpacing(4)
        header.addWidget(title)
        header.addWidget(subtitle)

        main_tabs = QTabWidget()
        main_tabs.setObjectName("mainTabs")

        general_tab = QWidget()
        general_layout = QVBoxLayout()
        general_layout.setContentsMargins(0, 0, 0, 0)
        general_layout.setSpacing(14)

        proxy_group = QGroupBox("代理服务")
        proxy_group.setObjectName("panelGroup")
        proxy_form = self._form_layout()

        self.host = QLineEdit(self.config.proxy_host)
        self.host.setPlaceholderText("127.0.0.1")
        proxy_form.addRow("监听地址", self.host)

        self.port = QSpinBox()
        self.port.setRange(1024, 65535)
        self.port.setValue(self.config.proxy_port)
        self.port.setSuffix(" 端口")
        proxy_form.addRow("代理端口", self.port)
        proxy_group.setLayout(proxy_form)

        floating_group = QGroupBox("悬浮窗")
        floating_group.setObjectName("panelGroup")
        floating_form = self._form_layout()

        self.threshold = QSpinBox()
        self.threshold.setRange(0, 100000000)
        self.threshold.setValue(self.config.alert_threshold_5m)
        self.threshold.setSuffix(" tokens")
        floating_form.addRow("5分钟预警阈值", self.threshold)

        self.opacity = QDoubleSpinBox()
        self.opacity.setRange(0.3, 1.0)
        self.opacity.setSingleStep(0.05)
        self.opacity.setValue(self.config.opacity)
        floating_form.addRow("透明度", self.opacity)

        self.theme = QComboBox()
        self.theme.addItems(["dark", "light"])
        self.theme.setCurrentText(self.config.theme)
        floating_form.addRow("主题", self.theme)

        self.always_on_top = QCheckBox("保持在最上层")
        self.always_on_top.setChecked(self.config.always_on_top)
        floating_form.addRow("置顶", self.always_on_top)

        self.lock_position = QCheckBox("锁定当前位置，避免误拖动")
        self.lock_position.setChecked(self.config.lock_position)
        floating_form.addRow("位置锁定", self.lock_position)

        self.show_on_start = QCheckBox("启动后显示悬浮窗")
        self.show_on_start.setChecked(self.config.show_on_start)
        floating_form.addRow("启动显示", self.show_on_start)
        floating_group.setLayout(floating_form)

        general_layout.addWidget(proxy_group)
        general_layout.addWidget(floating_group)
        general_layout.addStretch(1)
        general_tab.setLayout(general_layout)
        main_tabs.addTab(general_tab, "全局")

        providers_tab = QWidget()
        providers_layout = QVBoxLayout()
        providers_layout.setContentsMargins(0, 0, 0, 0)
        providers_layout.setSpacing(14)

        for name, provider in self.config.providers.items():
            card = QGroupBox(name)
            card.setObjectName("providerCard")
            provider_form = self._form_layout()

            enabled = QCheckBox("启用该 Provider")
            enabled.setChecked(provider.enabled)
            provider_form.addRow("状态", enabled)

            provider_type = QComboBox()
            provider_type.addItems(["openai_compatible", "anthropic", "gemini"])
            provider_type.setCurrentText(provider.provider_type)
            provider_form.addRow("接口类型", provider_type)

            auth_mode = QComboBox()
            auth_mode.addItems(["bearer", "x-api-key", "anthropic", "gemini", "pass_through", "none"])
            auth_mode.setCurrentText(provider.auth_mode)
            provider_form.addRow("鉴权方式", auth_mode)

            base = QLineEdit(provider.base_url)
            base.setPlaceholderText("https://relay.example.com/v1")
            provider_form.addRow("上游地址", base)

            key = QLineEdit(provider.api_key)
            key.setEchoMode(QLineEdit.Password)
            key.setPlaceholderText("sk-...")

            reveal = QPushButton("显示")
            reveal.setCheckable(True)
            reveal.setObjectName("secondaryButton")
            reveal.toggled.connect(
                lambda checked, field=key, button=reveal: self._toggle_key_visibility(
                    field, button, checked
                )
            )

            key_row = QHBoxLayout()
            key_row.setSpacing(8)
            key_row.addWidget(key)
            key_row.addWidget(reveal)
            provider_form.addRow("API Key", key_row)

            self.provider_fields[name] = {
                "enabled": enabled,
                "provider_type": provider_type,
                "auth_mode": auth_mode,
                "base_url": base,
                "api_key": key,
            }
            card.setLayout(provider_form)
            providers_layout.addWidget(card)
        providers_layout.addStretch(1)
        providers_tab.setLayout(providers_layout)
        main_tabs.addTab(providers_tab, "Provider")

        pricing_tab = QWidget()
        pricing_layout = QVBoxLayout()
        pricing_layout.setContentsMargins(0, 0, 0, 0)
        pricing_layout.setSpacing(14)

        currency_group = QGroupBox("成本显示")
        currency_group.setObjectName("panelGroup")
        currency_form = self._form_layout()
        self.currency = QComboBox()
        self.currency.addItems(["USD", "CNY"])
        self.currency.setCurrentText(self.config.currency)
        currency_form.addRow("币种", self.currency)
        self.usd_to_cny = QDoubleSpinBox()
        self.usd_to_cny.setRange(0.01, 100.0)
        self.usd_to_cny.setDecimals(4)
        self.usd_to_cny.setValue(self.config.usd_to_cny)
        currency_form.addRow("USD/CNY 汇率", self.usd_to_cny)
        currency_group.setLayout(currency_form)

        price_group = QGroupBox("模型单价（每 100 万 tokens，USD）")
        price_group.setObjectName("panelGroup")
        price_layout = QGridLayout()
        price_layout.setContentsMargins(16, 16, 16, 16)
        price_layout.setHorizontalSpacing(12)
        price_layout.setVerticalSpacing(10)
        price_layout.addWidget(QLabel("模型"), 0, 0)
        price_layout.addWidget(QLabel("输入"), 0, 1)
        price_layout.addWidget(QLabel("输出"), 0, 2)
        for row, model in enumerate(sorted(self.config.model_prices), start=1):
            prices = self.config.model_prices[model]
            name_label = QLabel(model)
            input_price = self._price_spin(float(prices.get("input", 0) or 0))
            output_price = self._price_spin(float(prices.get("output", 0) or 0))
            self.price_rows[model] = {"input": input_price, "output": output_price}
            price_layout.addWidget(name_label, row, 0)
            price_layout.addWidget(input_price, row, 1)
            price_layout.addWidget(output_price, row, 2)
        price_group.setLayout(price_layout)
        pricing_layout.addWidget(currency_group)
        pricing_layout.addWidget(price_group)
        pricing_layout.addStretch(1)
        pricing_tab.setLayout(pricing_layout)
        main_tabs.addTab(pricing_tab, "成本")
        
        # 数据管理标签页
        data_tab = QWidget()
        data_layout = QVBoxLayout()
        data_layout.setContentsMargins(0, 0, 0, 0)
        data_layout.setSpacing(14)
        
        # 数据统计信息
        info_group = QGroupBox("📊 数据统计")
        info_group.setObjectName("panelGroup")
        info_layout = QFormLayout()
        self.data_stats_label = QLabel("点击刷新查看数据统计")
        info_layout.addRow("当前状态:", self.data_stats_label)
        info_group.setLayout(info_layout)
        
        # 数据操作
        actions_group = QGroupBox("🔧 数据操作")
        actions_group.setObjectName("panelGroup")
        actions_layout = QVBoxLayout()
        actions_layout.setSpacing(10)
        
        refresh_data_btn = QPushButton("刷新统计信息")
        refresh_data_btn.setObjectName("secondaryButton")
        refresh_data_btn.clicked.connect(self.refresh_data_stats)
        
        clear_all_btn = QPushButton("⚠️ 清空所有历史数据")
        clear_all_btn.setStyleSheet("background-color: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;")
        clear_all_btn.clicked.connect(self.clear_all_data)
        
        actions_layout.addWidget(refresh_data_btn)
        actions_layout.addWidget(clear_all_btn)
        actions_group.setLayout(actions_layout)
        
        data_layout.addWidget(info_group)
        data_layout.addWidget(actions_group)
        data_layout.addStretch(1)
        data_tab.setLayout(data_layout)
        main_tabs.addTab(data_tab, "数据管理")

        scroll_content = QWidget()
        content_layout = QVBoxLayout()
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(14)
        content_layout.addLayout(header)
        content_layout.addWidget(main_tabs)
        scroll_content.setLayout(content_layout)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setWidget(scroll_content)

        buttons = QHBoxLayout()
        buttons.setSpacing(10)
        export_btn = QPushButton("导出配置")
        import_btn = QPushButton("导入配置")
        save = QPushButton("保存")
        save.setObjectName("primaryButton")
        cancel = QPushButton("取消")
        save.clicked.connect(self.accept)
        cancel.clicked.connect(self.reject)
        export_btn.clicked.connect(self.export_config)
        import_btn.clicked.connect(self.import_config)
        buttons.addWidget(export_btn)
        buttons.addWidget(import_btn)
        buttons.addStretch(1)
        buttons.addWidget(cancel)
        buttons.addWidget(save)

        layout = QVBoxLayout()
        layout.setContentsMargins(22, 20, 22, 18)
        layout.setSpacing(14)
        layout.addWidget(scroll)
        layout.addLayout(buttons)
        self.setLayout(layout)
        self._apply_dialog_style()

    def accept(self) -> None:
        self._save_ui_to_config()
        super().accept()

    def _form_layout(self) -> QFormLayout:
        form = QFormLayout()
        form.setContentsMargins(16, 16, 16, 16)
        form.setSpacing(12)
        form.setLabelAlignment(Qt.AlignRight | Qt.AlignVCenter)
        return form

    def _price_spin(self, value: float) -> QDoubleSpinBox:
        spin = QDoubleSpinBox()
        spin.setRange(0, 10000)
        spin.setDecimals(4)
        spin.setSingleStep(0.01)
        spin.setValue(value)
        return spin

    def _toggle_key_visibility(
        self, field: QLineEdit, button: QPushButton, checked: bool
    ) -> None:
        field.setEchoMode(QLineEdit.Normal if checked else QLineEdit.Password)
        button.setText("隐藏" if checked else "显示")

    def export_config(self) -> None:
        """导出当前配置到文件"""
        try:
            # 先保存当前界面中的设置到配置对象
            self._save_ui_to_config()
            
            # 生成默认文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            default_filename = f"tokenstats_config_{timestamp}.json"
            
            # 打开文件保存对话框
            file_path, _ = QFileDialog.getSaveFileName(
                self,
                "导出配置",
                default_filename,
                "JSON 文件 (*.json);;所有文件 (*.*)"
            )
            
            if not file_path:
                return
            
            # 导出配置
            export_config(self.config, Path(file_path))
            
            QMessageBox.information(self, "成功", f"配置已导出到：\n{file_path}")
            
        except Exception as e:
            QMessageBox.critical(self, "错误", f"导出失败：\n{str(e)}")

    def import_config(self) -> None:
        """从文件导入配置"""
        try:
            # 打开文件选择对话框
            file_path, _ = QFileDialog.getOpenFileName(
                self,
                "导入配置",
                "",
                "JSON 文件 (*.json);;所有文件 (*.*)"
            )
            
            if not file_path:
                return
            
            # 确认导入
            reply = QMessageBox.question(
                self,
                "确认导入",
                "导入配置将覆盖当前所有设置，确定继续吗？",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No
            )
            
            if reply != QMessageBox.Yes:
                return
            
            # 导入配置
            new_config = import_config(Path(file_path))
            
            # 更新当前配置对象
            self.config.proxy_host = new_config.proxy_host
            self.config.proxy_port = new_config.proxy_port
            self.config.alert_threshold_5m = new_config.alert_threshold_5m
            self.config.opacity = new_config.opacity
            self.config.theme = new_config.theme
            self.config.always_on_top = new_config.always_on_top
            self.config.lock_position = new_config.lock_position
            self.config.show_on_start = new_config.show_on_start
            self.config.window_x = new_config.window_x
            self.config.window_y = new_config.window_y
            self.config.currency = new_config.currency
            self.config.usd_to_cny = new_config.usd_to_cny
            self.config.model_prices = new_config.model_prices
            self.config.providers = new_config.providers
            
            # 重新加载 UI
            self._load_config_to_ui()
            
            QMessageBox.information(self, "成功", "配置导入成功！\n请点击“保存”按钮使配置生效。")
            
        except Exception as e:
            QMessageBox.critical(self, "错误", f"导入失败：\n{str(e)}")

    def _save_ui_to_config(self) -> None:
        """将当前 UI 中的设置保存到配置对象（不保存到文件）"""
        self.config.proxy_host = self.host.text().strip() or "127.0.0.1"
        self.config.proxy_port = self.port.value()
        self.config.alert_threshold_5m = self.threshold.value()
        self.config.opacity = self.opacity.value()
        self.config.theme = self.theme.currentText()
        self.config.always_on_top = self.always_on_top.isChecked()
        self.config.lock_position = self.lock_position.isChecked()
        self.config.show_on_start = self.show_on_start.isChecked()
        self.config.currency = self.currency.currentText()
        self.config.usd_to_cny = self.usd_to_cny.value()
        for name, fields in self.provider_fields.items():
            self.config.providers[name] = ProviderConfig(
                base_url=fields["base_url"].text().strip(),
                api_key=fields["api_key"].text().strip(),
                enabled=fields["enabled"].isChecked(),
                provider_type=fields["provider_type"].currentText(),
                auth_mode=fields["auth_mode"].currentText(),
            )
        for model, fields in self.price_rows.items():
            self.config.model_prices[model] = {
                "input": fields["input"].value(),
                "output": fields["output"].value(),
            }

    def _load_config_to_ui(self) -> None:
        """从配置对象加载设置到 UI"""
        # 全局设置
        self.host.setText(self.config.proxy_host)
        self.port.setValue(self.config.proxy_port)
        self.threshold.setValue(self.config.alert_threshold_5m)
        self.opacity.setValue(self.config.opacity)
        self.theme.setCurrentText(self.config.theme)
        self.always_on_top.setChecked(self.config.always_on_top)
        self.lock_position.setChecked(self.config.lock_position)
        self.show_on_start.setChecked(self.config.show_on_start)
        self.currency.setCurrentText(self.config.currency)
        self.usd_to_cny.setValue(self.config.usd_to_cny)
        
        # 重新初始化 provider fields
        for name, provider in self.config.providers.items():
            if name in self.provider_fields:
                fields = self.provider_fields[name]
                fields["enabled"].setChecked(provider.enabled)
                fields["provider_type"].setCurrentText(provider.provider_type)
                fields["auth_mode"].setCurrentText(provider.auth_mode)
                fields["base_url"].setText(provider.base_url)
                fields["api_key"].setText(provider.api_key)
        
        # 重新初始化价格 fields
        for model, prices in self.config.model_prices.items():
            if model in self.price_rows:
                fields = self.price_rows[model]
                fields["input"].setValue(float(prices.get("input", 0) or 0))
                fields["output"].setValue(float(prices.get("output", 0) or 0))
    
    def refresh_data_stats(self) -> None:
        """刷新数据统计信息"""
        if not self.store:
            self.data_stats_label.setText("无法访问数据存储")
            return
        
        try:
            snap = self.store.snapshot()
            total_tokens = snap["total_tokens"]
            today_tokens = snap["today_tokens"]
            providers = self.store.providers()
            
            stats_text = f"总 Token: {total_tokens:,} | 今日: {today_tokens:,} | Provider数: {len(providers)}"
            self.data_stats_label.setText(stats_text)
        except Exception as e:
            self.data_stats_label.setText(f"获取统计信息失败: {str(e)}")
    
    def clear_all_data(self) -> None:
        """清空所有历史数据"""
        reply = QMessageBox.question(
            self,
            "⚠️ 确认清空",
            "此操作将删除所有历史统计数据，且无法恢复。确定要继续吗？",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )
        
        if reply == QMessageBox.Yes:
            try:
                if self.store:
                    self.store.clear()
                QMessageBox.information(self, "成功", "所有历史数据已清空！")
                self.refresh_data_stats()
            except Exception as e:
                QMessageBox.critical(self, "错误", f"清空数据失败: {str(e)}")

    def _apply_dialog_style(self) -> None:
        self.setStyleSheet(
            """
            QDialog#settingsDialog {
                background: #eef2f7;
                color: #0f172a;
            }
            QDialog#settingsDialog QWidget {
                color: #0f172a;
                background: transparent;
            }
            QDialog#settingsDialog QLabel {
                color: #334155;
                background: transparent;
            }
            QLabel#dialogTitle {
                font-size: 24px;
                font-weight: 700;
                color: #0f172a;
            }
            QLabel#dialogSubtitle {
                color: #64748b;
                font-size: 13px;
            }
            QGroupBox#panelGroup, QGroupBox#providerCard {
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                margin-top: 14px;
                font-weight: 700;
                color: #334155;
            }
            QGroupBox#panelGroup::title, QGroupBox#providerCard::title {
                subcontrol-origin: margin;
                left: 14px;
                padding: 0 6px;
                color: #334155;
                background: #eef2f7;
            }
            QScrollArea {
                background: #eef2f7;
                border: none;
            }
            QScrollArea > QWidget > QWidget {
                background: #eef2f7;
            }
            QTabWidget::pane {
                background: transparent;
                border: none;
                border-radius: 8px;
                top: 0;
            }
            QTabWidget QWidget {
                background: transparent;
                color: #0f172a;
            }
            QTabBar::tab {
                background: #dbe3ee;
                color: #475569;
                padding: 9px 18px;
                border-radius: 7px;
                margin-right: 6px;
            }
            QTabBar::tab:selected {
                background: #0f172a;
                color: #ffffff;
                font-weight: 700;
            }
            QTabBar::tab:hover {
                background: #cbd5e1;
            }
            QCheckBox {
                color: #0f172a;
                spacing: 8px;
            }
            QCheckBox::indicator {
                width: 16px;
                height: 16px;
                border-radius: 4px;
                border: 1px solid #94a3b8;
                background: #ffffff;
            }
            QCheckBox::indicator:checked {
                background: #2563eb;
                border: 1px solid #2563eb;
            }
            QComboBox, QLineEdit, QSpinBox, QDoubleSpinBox {
                min-height: 34px;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                padding: 4px 10px;
                background: #ffffff;
                color: #0f172a;
                selection-background-color: #bfdbfe;
                selection-color: #0f172a;
            }
            QComboBox:focus, QLineEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus {
                border: 1px solid #2563eb;
            }
            QLineEdit[echoMode="2"] {
                color: #0f172a;
            }
            QLineEdit::placeholder {
                color: #94a3b8;
            }
            QComboBox QAbstractItemView {
                background: #ffffff;
                color: #0f172a;
                border: 1px solid #cbd5e1;
                selection-background-color: #dbeafe;
                selection-color: #0f172a;
            }
            QPushButton {
                min-height: 34px;
                border-radius: 6px;
                padding: 5px 16px;
                border: 1px solid #cbd5e1;
                background: #ffffff;
                color: #0f172a;
            }
            QPushButton:hover {
                background: #f1f5f9;
            }
            QPushButton#primaryButton {
                background: #2563eb;
                color: #ffffff;
                border: 1px solid #2563eb;
                font-weight: 700;
            }
            QPushButton#primaryButton:hover {
                background: #1d4ed8;
            }
            QPushButton#secondaryButton {
                background: #f8fafc;
                color: #334155;
                border: 1px solid #cbd5e1;
            }
            """
        )
