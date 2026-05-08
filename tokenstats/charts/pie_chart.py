from typing import Dict

import numpy as np
import pyqtgraph as pg
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QColor, QFont
from PyQt5.QtWidgets import QLabel, QVBoxLayout, QWidget

from ..themes import ThemeManager


class PieChart(QWidget):
    """饼图组件，显示占比分布"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        
        # 主题管理器
        self.theme_manager = ThemeManager()
        
        # 布局
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        
        # 创建 PlotWidget
        self.plot_widget = pg.PlotWidget()
        self.plot_widget.setBackground("transparent")
        self.plot_widget.hideAxis("left")
        self.plot_widget.hideAxis("bottom")
        self.plot_widget.setAspectLocked(True)
        
        layout.addWidget(self.plot_widget)
        
        # 添加图例标签
        self.legend_label = QLabel()
        self.legend_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(self.legend_label)
        
        self.setLayout(layout)
        
        # 数据存储
        self._data: Dict[str, float] = {}
        self._pie_items = []
        
    def set_data(self, data: Dict[str, float], title: str = ""):
        """
        设置图表数据
        
        Args:
            data: 字典，key 为名称，value 为数值
            title: 图表标题
        """
        self._data = data
        self._update_plot()
        
        if title:
            self.plot_widget.setTitle(title, color=self.theme_manager.current_theme.text_primary, size="14px")
            
    def _update_plot(self):
        """更新图表显示"""
        # 清除旧数据
        self.plot_widget.clear()
        self._pie_items = []
        
        if not self._data:
            return
            
        theme = self.theme_manager.current_theme
        colors = theme.chart_colors
        
        # 计算总和
        total = sum(self._data.values())
        if total == 0:
            return
            
        # 准备数据
        names = list(self._data.keys())
        values = list(self._data.values())
        
        # 计算角度
        angles = [v / total * 360 for v in values]
        
        # 创建饼图
        start_angle = 0
        legend_text = []
        
        for i, (name, value, angle) in enumerate(zip(names, values, angles)):
            color = colors[i % len(colors)]
            
            # 创建扇形
            # 使用 ScatterPlotItem 模拟饼图
            # 这里使用简化的方式：绘制扇形区域
            
            # 计算扇形的点
            num_points = max(3, int(angle / 5))  # 每5度一个点
            theta = np.linspace(np.radians(start_angle), np.radians(start_angle + angle), num_points)
            
            # 创建扇形路径
            x = np.concatenate([[0], np.cos(theta), [0]])
            y = np.concatenate([[0], np.sin(theta), [0]])
            
            # 创建填充区域
            fill = pg.FillBetweenItem(
                pg.PlotDataItem(x, y),
                pg.PlotDataItem([0, 0], [0, 0]),
                brush=pg.mkBrush(color=color)
            )
            self.plot_widget.addItem(fill)
            
            # 添加边框
            border = pg.PlotDataItem(x, y, pen=pg.mkPen(color=theme.card_border, width=1))
            self.plot_widget.addItem(border)
            
            # 计算百分比
            percentage = (value / total) * 100
            legend_text.append(f"<span style='color: {color};'>●</span> {name}: {percentage:.1f}%")
            
            start_angle += angle
            
        # 设置显示范围
        self.plot_widget.setXRange(-1.5, 1.5)
        self.plot_widget.setYRange(-1.5, 1.5)
        
        # 更新图例
        self.legend_label.setText("  ".join(legend_text))
        
    def clear(self):
        """清除所有数据"""
        self._data = {}
        self._pie_items = []
        self.plot_widget.clear()
        self.legend_label.setText("")
