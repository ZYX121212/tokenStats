from datetime import datetime
from pathlib import Path
from typing import Dict

from PyQt5.QtCore import Qt
from PyQt5.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QDoubleSpinBox,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ..config import AppConfig, ProviderConfig, export_config, import_config, save_config
from ..storage import TokenStore
from ..themes import ThemeManager, get_all_preset_names


class SettingsDialog(QDialog):
    def __init__(self, config: AppConfig, store=None, parent=None) -> None:
        super().__init__(parent)
        self.config = config
        self.store = store
        self.provider_fields: Dict[str, Dict] = {}
        self.price_rows: Dict[str, Dict] = {}
        
        # 主题管理器
        self.theme_manager = ThemeManager()
        
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

        # 全局设置标签页
        general_tab = QWidget()
        general_layout = QVBoxLayout()
        general_layout.setContentsMargins(0, 0, 0, 0)
        general_layout.setSpacing(14)

        # 代理服务组
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

        # 悬浮窗组
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

        # 主题选择
        self.theme_combo = QComboBox()
        for name, display_name in get_all_preset_names():
            self.theme_combo.addItem(display_name, name)
        
        # 设置当前主题
        current_theme_index = self.theme_combo.findData(self.config.theme)
        if current_theme_index >= 0:
            self.theme_combo.setCurrentIndex(current_theme_index)
        
        floating_form.addRow("主题", self.theme_combo)

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

        # Provider 标签页
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

        # 成本标签页
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
        price_layout = QVBoxLayout()
        price_layout.setContentsMargins(16, 16, 16, 16)
        price_layout.setSpacing(10)
        
        # 表头
        header_layout = QHBoxLayout()
        header_layout.addWidget(QLabel("模型"))
        header_layout.addWidget(QLabel("输入"))
        header_layout.addWidget(QLabel("输出"))
        price_layout.addLayout(header_layout)
        
        for model in sorted(self.config.model_prices):
            prices = self.config.model_prices[model]
            row = QHBoxLayout()
            name_label = QLabel(model)
            input_price = self._price_spin(float(prices.get("input", 0) or 0))
            output_price = self._price_spin(float(prices.get("output", 0) or 0))
            self.price_rows[model] = {"input": input_price, "output": output_price}
            row.addWidget(name_label)
            row.addWidget(input_price)
            row.addWidget(output_price)
            price_layout.addLayout(row)
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
        
        info_group = QGroupBox("数据统计")
        info_group.setObjectName("panelGroup")
        info_layout = QFormLayout()
        self.data_stats_label = QLabel("点击刷新查看数据统计")
        info_layout.addRow("当前状态:", self.data_stats_label)
        info_group.setLayout(info_layout)
        
        actions_group = QGroupBox("数据操作")
        actions_group.setObjectName("panelGroup")
        actions_layout = QVBoxLayout()
        actions_layout.setSpacing(10)
        
        refresh_data_btn = QPushButton("刷新统计信息")
        refresh_data_btn.setObjectName("secondaryButton")
        refresh_data_btn.clicked.connect(self.refresh_data_stats)
        
        clear_all_btn = QPushButton("清空所有历史数据")
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
        scroll.setFrameShape(QScrollArea.NoFrame)
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
        
        # 应用主题样式
        self._apply_theme_style()

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
            self._save_ui_to_config()
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            default_filename = f"tokenstats_config_{timestamp}.json"
            
            file_path, _ = QFileDialog.getSaveFileName(
                self,
                "导出配置",
                default_filename,
                "JSON 文件 (*.json);;所有文件 (*.*)"
            )
            
            if not file_path:
                return
            
            export_config(self.config, Path(file_path))
            
            QMessageBox.information(self, "成功", f"配置已导出到：\n{file_path}")
            
        except Exception as e:
            QMessageBox.critical(self, "错误", f"导出失败：\n{str(e)}")

    def import_config(self) -> None:
        """从文件导入配置"""
        try:
            file_path, _ = QFileDialog.getOpenFileName(
                self,
                "导入配置",
                "",
                "JSON 文件 (*.json);;所有文件 (*.*)"
            )
            
            if not file_path:
                return
            
            reply = QMessageBox.question(
                self,
                "确认导入",
                "导入配置将覆盖当前所有设置，确定继续吗？",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.No
            )
            
            if reply != QMessageBox.Yes:
                return
            
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
        """将当前 UI 中的设置保存到配置对象"""
        self.config.proxy_host = self.host.text().strip() or "127.0.0.1"
        self.config.proxy_port = self.port.value()
        self.config.alert_threshold_5m = self.threshold.value()
        self.config.opacity = self.opacity.value()
        
        # 保存主题设置
        theme_name = self.theme_combo.currentData()
        if theme_name:
            self.config.theme = theme_name
            # 应用主题
            self.theme_manager.set_theme(theme_name)
        
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
        
        # 主题
        current_theme_index = self.theme_combo.findData(self.config.theme)
        if current_theme_index >= 0:
            self.theme_combo.setCurrentIndex(current_theme_index)
        
        self.always_on_top.setChecked(self.config.always_on_top)
        self.lock_position.setChecked(self.config.lock_position)
        self.show_on_start.setChecked(self.config.show_on_start)
        self.currency.setCurrentText(self.config.currency)
        self.usd_to_cny.setValue(self.config.usd_to_cny)
        
        # Provider fields
        for name, provider in self.config.providers.items():
            if name in self.provider_fields:
                fields = self.provider_fields[name]
                fields["enabled"].setChecked(provider.enabled)
                fields["provider_type"].setCurrentText(provider.provider_type)
                fields["auth_mode"].setCurrentText(provider.auth_mode)
                fields["base_url"].setText(provider.base_url)
                fields["api_key"].setText(provider.api_key)
        
        # 价格 fields
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
            "确认清空",
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

    def _apply_theme_style(self) -> None:
        """应用主题样式"""
        theme = self.theme_manager.current_theme
        self.setStyleSheet(theme.to_dialog_stylesheet())
