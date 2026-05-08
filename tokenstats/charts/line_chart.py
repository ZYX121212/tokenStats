import time
from typing import Dict, List, Optional

import numpy as np
import pyqtgraph as pg
from PyQt5.QtCore import Qt
from PyQt5.QtWidgets import QVBoxLayout, QWidget

from ..themes import ThemeManager


class LineChart(QWidget):
    """折线图组件，显示 token 消耗趋势"""
    
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
        self.plot_widget.showGrid(x=True, y=True, alpha=0.3)
        
        # 设置标签样式
        self._update_axis_style()
        
        layout.addWidget(self.plot_widget)
        self.setLayout(layout)
        
        # 数据存储
        self._data: Dict[str, List[tuple]] = {}
        self._plots: Dict[str, pg.PlotDataItem] = {}
        
    def _update_axis_style(self):
        """更新坐标轴样式"""
        theme = self.theme_manager.current_theme
        
        # 设置坐标轴颜色
        axis_color = theme.text_secondary
        self.plot_widget.getAxis("bottom").setPen(pg.mkPen(color=axis_color, width=1))
        self.plot_widget.getAxis("left").setPen(pg.mkPen(color=axis_color, width=1))
        self.plot_widget.getAxis("bottom").setTextPen(pg.mkPen(color=axis_color, width=1))
        self.plot_widget.getAxis("left").setTextPen(pg.mkPen(color=axis_color, width=1))
        
    def set_data(self, data: Dict[str, List[tuple]], title: str = ""):
        """
        设置图表数据
        
        Args:
            data: 字典，key 为系列名称，value 为 (时间戳, 数值) 列表
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
        self._plots = {}
        
        theme = self.theme_manager.current_theme
        colors = theme.chart_colors
        
        # 添加新的数据系列
        for idx, (name, points) in enumerate(self._data.items()):
            if not points:
                continue
                
            # 分离时间和数值
            times = [p[0] for p in points]
            values = [p[1] for p in points]
            
            # 转换为 numpy 数组
            x = np.array(times)
            y = np.array(values)
            
            # 选择颜色
            color = colors[idx % len(colors)]
            
            # 创建曲线
            pen = pg.mkPen(color=color, width=2)
            plot = self.plot_widget.plot(x, y, pen=pen, name=name, symbol="o", symbolSize=4, symbolBrush=color)
            self._plots[name] = plot
            
        # 添加图例
        if len(self._data) > 1:
            legend = self.plot_widget.addLegend()
            legend.setBrush(pg.mkBrush(color=theme.card_bg))
            
    def update_realtime(self, series_name: str, timestamp: float, value: float):
        """
        实时更新数据
        
        Args:
            series_name: 系列名称
            timestamp: 时间戳
            value: 数值
        """
        if series_name not in self._data:
            self._data[series_name] = []
            
        self._data[series_name].append((timestamp, value))
        
        # 限制数据点数量，避免性能问题
        max_points = 1000
        if len(self._data[series_name]) > max_points:
            self._data[series_name] = self._data[series_name][-max_points:]
            
        self._update_plot()
        
    def clear(self):
        """清除所有数据"""
        self._data = {}
        self._plots = {}
        self.plot_widget.clear()
