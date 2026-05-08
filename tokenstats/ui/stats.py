import csv
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from PyQt5.QtCore import Qt
from PyQt5.QtWidgets import (
    QAbstractItemView,
    QComboBox,
    QDialog,
    QFileDialog,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMessageBox,
    QPushButton,
    QTabWidget,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from ..charts import BarChart, LineChart, PieChart
from ..config import AppConfig, format_cost, estimate_cost
from ..storage import TokenStore
from ..themes import ThemeManager


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
        
        # 主题管理器
        self.theme_manager = ThemeManager()
        self.theme_manager.add_listener(self._on_theme_changed)

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

        # 创建图表标签页
        self.chart_tabs = QTabWidget()
        
        # 数据表格标签页
        self.table_tab = QWidget()
        table_layout = QVBoxLayout()
        table_layout.addWidget(self.table)
        self.table_tab.setLayout(table_layout)
        self.chart_tabs.addTab(self.table_tab, "数据表格")
        
        # 趋势图标签页
        self.trend_tab = QWidget()
        trend_layout = QVBoxLayout()
        self.line_chart = LineChart()
        trend_layout.addWidget(self.line_chart)
        self.trend_tab.setLayout(trend_layout)
        self.chart_tabs.addTab(self.trend_tab, "趋势")
        
        # 对比图标签页
        self.compare_tab = QWidget()
        compare_layout = QVBoxLayout()
        self.bar_chart = BarChart()
        compare_layout.addWidget(self.bar_chart)
        self.compare_tab.setLayout(compare_layout)
        self.chart_tabs.addTab(self.compare_tab, "对比")
        
        # 分布图标签页
        self.distribution_tab = QWidget()
        distribution_layout = QVBoxLayout()
        self.pie_chart = PieChart()
        distribution_layout.addWidget(self.pie_chart)
        self.distribution_tab.setLayout(distribution_layout)
        self.chart_tabs.addTab(self.distribution_tab, "分布")

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
        layout.addWidget(self.chart_tabs)
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
        
        # 更新图表
        self._update_charts(data)

    def _update_charts(self, data):
        """更新图表数据"""
        rows = data["rows"]
        
        # 更新柱状图（模型对比）
        bar_data = {}
        for row in rows:
            model = str(row["model"])
            total = int(row.get("total_tokens", 0) or 0)
            if total > 0:
                bar_data[model] = total
        
        if bar_data:
            self.bar_chart.set_data(bar_data, "各模型 Token 消耗对比")
        
        # 更新饼图（占比分布）
        pie_data = {}
        for row in rows:
            model = str(row["model"])
            total = int(row.get("total_tokens", 0) or 0)
            if total > 0:
                pie_data[model] = total
        
        if pie_data:
            self.pie_chart.set_data(pie_data, "模型消耗占比")
        
        # 更新折线图（时间趋势）
        # 获取最近的事件数据
        try:
            events = self.store.recent_events(limit=100)
            if events:
                # 按模型分组的时间序列数据
                line_data = {}
                for event in reversed(events):  # 按时间顺序
                    model = event.get("model", "Unknown")
                    ts = event.get("ts", 0)
                    total = event.get("total_tokens", 0)
                    
                    if model not in line_data:
                        line_data[model] = []
                    line_data[model].append((ts, total))
                
                if line_data:
                    self.line_chart.set_data(line_data, "Token 消耗趋势")
        except Exception:
            pass  # 如果获取事件失败，忽略

    def _summary_card(self, title: str, value_label: QLabel) -> QFrame:
        card = QFrame()
        card.setObjectName("summaryCard")
        card.setSizePolicy(QVBoxLayout().sizePolicy())
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
            since_ts = self._selected_since_ts()
            provider = self.provider_filter.currentText()
            provider_value = None if provider in ("", "全部") else provider
            data = self.store.model_usage_summary(since_ts, provider_value)
            
            if not data["rows"]:
                QMessageBox.information(self, "提示", "没有数据可导出")
                return
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            default_filename = f"tokenstats_export_{timestamp}.csv"
            
            file_path, _ = QFileDialog.getSaveFileName(
                self,
                "导出 CSV",
                default_filename,
                "CSV 文件 (*.csv);;所有文件 (*.*)"
            )
            
            if not file_path:
                return
            
            with open(file_path, "w", newline="", encoding="utf-8-sig") as csv_file:
                writer = csv.writer(csv_file)
                
                headers = [
                    "模型", "Provider", "调用次数", "Prompt Tokens", 
                    "Completion Tokens", "Cached Tokens", "Total Tokens", 
                    "占比", "估算成本", "最后调用时间"
                ]
                writer.writerow(headers)
                
                total_tokens = int(data["total"].get("total_tokens", 0) or 0)
                
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

    def _on_theme_changed(self, theme) -> None:
        """主题变更回调"""
        self._apply_dialog_style()

    def _apply_dialog_style(self) -> None:
        """应用对话框样式"""
        theme = self.theme_manager.current_theme
        self.setStyleSheet(theme.to_dialog_stylesheet())

    def closeEvent(self, event) -> None:
        """清理资源"""
        self.theme_manager.remove_listener(self._on_theme_changed)
        super().closeEvent(event)
