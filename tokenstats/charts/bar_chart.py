from typing import Dict, List

import numpy as np
import pyqtgraph as pg
from PyQt5.QtWidgets import QVBoxLayout, QWidget

from ..themes import ThemeManager


class BarChart(QWidget):
    """柱状图组件，显示模型/Provider 对比"""
    
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
        self._data: Dict[str, float] = {}
        self._bar_graph = None
        
    def _update_axis_style(self):
        """更新坐标轴样式"""
        theme = self.theme_manager.current_theme
        
        axis_color = theme.text_secondary
        self.plot_widget.getAxis("bottom").setPen(pg.mkPen(color=axis_color, width=1))
        self.plot_widget.getAxis("left").setPen(pg.mkPen(color=axis_color, width=1))
        self.plot_widget.getAxis("bottom").setTextPen(pg.mkPen(color=axis_color, width=1))
        self.plot_widget.getAxis("left").setTextPen(pg.mkPen(color=axis_color, width=1))
        
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
        self._bar_graph = None
        
        if not self._data:
            return
            
        theme = self.theme_manager.current_theme
        colors = theme.chart_colors
        
        # 准备数据
        names = list(self._data.keys())
        values = list(self._data.values())
        
        # 创建 x 坐标
        x = np.arange(len(names))
        y = np.array(values)
        
        # 创建柱状图
        bar_width = 0.6
        
        # 为每个柱子设置不同颜色
        brushes = []
        for i in range(len(names)):
            color = colors[i % len(colors)]
            brushes.append(pg.mkBrush(color=color))
        
        # 使用 BarGraphItem 创建柱状图
        self._bar_graph = pg.BarGraphItem(
            x=x, 
            height=y, 
            width=bar_width,
            brushes=brushes,
            pens=[pg.mkPen(color=theme.card_border, width=1)] * len(names)
        )
        self.plot_widget.addItem(self._bar_graph)
        
        # 设置 x 轴标签
        axis = self.plot_widget.getAxis("bottom")
        axis.setTicks([[(i, name) for i, name in enumerate(names)]])
        
        # 设置 y 轴范围
        if values:
            max_val = max(values)
            self.plot_widget.setYRange(0, max_val * 1.1)
            
    def clear(self):
        """清除所有数据"""
        self._data = {}
        self._bar_graph = None
        self.plot_widget.clear()
