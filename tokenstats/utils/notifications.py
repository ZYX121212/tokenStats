import platform
from typing import Optional

from PyQt5.QtWidgets import QSystemTrayIcon


class NotificationManager:
    """系统通知管理器"""
    
    def __init__(self, tray_icon: Optional[QSystemTrayIcon] = None):
        self.tray_icon = tray_icon
        self._enabled = True
        
    def set_tray_icon(self, tray_icon: QSystemTrayIcon):
        """设置托盘图标"""
        self.tray_icon = tray_icon
        
    def set_enabled(self, enabled: bool):
        """设置是否启用通知"""
        self._enabled = enabled
        
    def send_notification(
        self, 
        title: str, 
        message: str, 
        icon_type: int = QSystemTrayIcon.Information,
        duration: int = 10000
    ) -> bool:
        """
        发送系统通知
        
        Args:
            title: 通知标题
            message: 通知内容
            icon_type: 图标类型 (Information, Warning, Critical)
            duration: 显示时长（毫秒）
            
        Returns:
            是否发送成功
        """
        if not self._enabled or not self.tray_icon:
            return False
            
        try:
            self.tray_icon.showMessage(title, message, icon_type, duration)
            return True
        except Exception:
            return False
            
    def send_threshold_alert(self, current_value: int, threshold: int) -> bool:
        """
        发送阈值预警通知
        
        Args:
            current_value: 当前值
            threshold: 阈值
            
        Returns:
            是否发送成功
        """
        message = f"⚠️ Token 消耗预警！\n"
        message += f"5分钟内已使用 {current_value:,} tokens\n"
        message += f"预警阈值: {threshold:,} tokens"
        
        return self.send_notification(
            "TokenStats 预警",
            message,
            QSystemTrayIcon.Warning,
            10000
        )
        
    def send_daily_report(self, total_tokens: int, today_tokens: int, cost: float, currency: str = "USD") -> bool:
        """
        发送每日报告通知
        
        Args:
            total_tokens: 总 token 数
            today_tokens: 今日 token 数
            cost: 估算成本
            currency: 币种
            
        Returns:
            是否发送成功
        """
        prefix = "¥" if currency == "CNY" else "$"
        message = f"📊 昨日统计报告\n"
        message += f"总 Token: {total_tokens:,}\n"
        message += f"今日 Token: {today_tokens:,}\n"
        message += f"估算成本: {prefix}{cost:.4f}"
        
        return self.send_notification(
            "TokenStats 每日报告",
            message,
            QSystemTrayIcon.Information,
            15000
        )
        
    def send_error_notification(self, error_message: str) -> bool:
        """
        发送错误通知
        
        Args:
            error_message: 错误信息
            
        Returns:
            是否发送成功
        """
        return self.send_notification(
            "TokenStats 错误",
            f"发生错误: {error_message}",
            QSystemTrayIcon.Critical,
            10000
        )
