from typing import Optional

from .base import Theme
from .presets import get_preset_theme


class ThemeManager:
    """主题管理器，负责主题的切换和管理"""
    
    _instance: Optional["ThemeManager"] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._current_theme = get_preset_theme("modern_light")
            cls._instance._listeners = []
        return cls._instance
    
    @property
    def current_theme(self) -> Theme:
        """获取当前主题"""
        return self._current_theme
    
    def set_theme(self, theme_name: str) -> None:
        """设置主题"""
        self._current_theme = get_preset_theme(theme_name)
        self._notify_listeners()
    
    def set_custom_theme(self, theme: Theme) -> None:
        """设置自定义主题"""
        self._current_theme = theme
        self._notify_listeners()
    
    def add_listener(self, callback) -> None:
        """添加主题变更监听器"""
        if callback not in self._listeners:
            self._listeners.append(callback)
    
    def remove_listener(self, callback) -> None:
        """移除主题变更监听器"""
        if callback in self._listeners:
            self._listeners.remove(callback)
    
    def _notify_listeners(self) -> None:
        """通知所有监听器主题已变更"""
        for listener in self._listeners:
            try:
                listener(self._current_theme)
            except Exception:
                pass
    
    def get_floating_stylesheet(self) -> str:
        """获取悬浮窗样式表"""
        return self._current_theme.to_stylesheet()
    
    def get_dialog_stylesheet(self) -> str:
        """获取对话框样式表"""
        return self._current_theme.to_dialog_stylesheet()
