from typing import Callable, Dict, Optional

from PyQt5.QtCore import Qt
from PyQt5.QtGui import QKeySequence
from PyQt5.QtWidgets import QShortcut, QWidget


class ShortcutManager:
    """全局快捷键管理器"""
    
    def __init__(self, parent: QWidget):
        self.parent = parent
        self._shortcuts: Dict[str, QShortcut] = {}
        self._handlers: Dict[str, Callable] = {}
        
    def register_shortcut(self, name: str, key_sequence: str, handler: Callable) -> bool:
        """
        注册快捷键
        
        Args:
            name: 快捷键名称
            key_sequence: 快捷键序列，如 "Ctrl+Shift+T"
            handler: 快捷键触发时的回调函数
            
        Returns:
            是否注册成功
        """
        try:
            # 如果已存在，先移除
            if name in self._shortcuts:
                self.unregister_shortcut(name)
                
            # 创建快捷键
            shortcut = QShortcut(QKeySequence(key_sequence), self.parent)
            shortcut.activated.connect(handler)
            
            self._shortcuts[name] = shortcut
            self._handlers[name] = handler
            
            return True
        except Exception:
            return False
            
    def unregister_shortcut(self, name: str) -> bool:
        """
        注销快捷键
        
        Args:
            name: 快捷键名称
            
        Returns:
            是否注销成功
        """
        if name in self._shortcuts:
            shortcut = self._shortcuts[name]
            shortcut.setEnabled(False)
            del self._shortcuts[name]
            
            if name in self._handlers:
                del self._handlers[name]
                
            return True
        return False
        
    def update_shortcut(self, name: str, key_sequence: str) -> bool:
        """
        更新快捷键
        
        Args:
            name: 快捷键名称
            key_sequence: 新的快捷键序列
            
        Returns:
            是否更新成功
        """
        if name in self._handlers:
            handler = self._handlers[name]
            return self.register_shortcut(name, key_sequence, handler)
        return False
        
    def enable_shortcut(self, name: str, enabled: bool = True) -> bool:
        """
        启用/禁用快捷键
        
        Args:
            name: 快捷键名称
            enabled: 是否启用
            
        Returns:
            是否操作成功
        """
        if name in self._shortcuts:
            self._shortcuts[name].setEnabled(enabled)
            return True
        return False
        
    def clear_all(self):
        """清除所有快捷键"""
        for shortcut in self._shortcuts.values():
            shortcut.setEnabled(False)
        self._shortcuts.clear()
        self._handlers.clear()
