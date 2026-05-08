import sys

from PyQt5.QtWidgets import QApplication, QMessageBox

from .config import DB_PATH, load_config, save_config
from .proxy import ProxyServer
from .storage import TokenStore
from .themes import ThemeManager
from .ui import FloatingWindow, StatsDialog, make_tray_icon
from .utils import BackupManager, NotificationManager, ShortcutManager


def main() -> int:
    config = load_config()
    store = TokenStore(DB_PATH)
    proxy = ProxyServer(config, store)
    
    # 初始化主题管理器
    theme_manager = ThemeManager()
    theme_manager.set_theme(config.theme)
    
    # 初始化备份管理器
    backup_manager = BackupManager(
        DB_PATH, 
        retention_days=config.backup_retention_days
    )
    
    # 自动备份
    if config.auto_backup:
        backup_manager.auto_backup()

    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    
    # 初始化快捷键管理器
    shortcut_manager = ShortcutManager(None)
    
    try:
        proxy.start()
    except OSError as exc:
        QMessageBox.critical(
            None,
            "TokenStats",
            f"代理端口启动失败: {exc}\n请在设置中更换端口，或关闭占用该端口的程序。",
        )

    def restart_proxy() -> None:
        proxy.stop()
        try:
            proxy.start()
        except OSError as exc:
            QMessageBox.critical(None, "TokenStats", f"代理重启失败: {exc}")

    stats_dialog = StatsDialog(store, config)

    def open_stats() -> None:
        stats_dialog.show()
        stats_dialog.raise_()
        stats_dialog.activateWindow()

    window = FloatingWindow(config, store, restart_proxy, open_stats)
    window.move(config.window_x, config.window_y)
    if config.show_on_start:
        window.show()
    
    # 创建托盘图标
    tray = make_tray_icon(app, window, open_stats, window.open_settings)
    window.set_tray_icon(tray)
    
    # 初始化通知管理器
    notification_manager = NotificationManager(tray)
    notification_manager.set_enabled(config.enable_notifications)
    
    # 注册全局快捷键
    def toggle_window():
        """切换悬浮窗显示/隐藏"""
        if window.isVisible():
            window.hide()
        else:
            window.show()
            window.raise_()
    
    def quit_app():
        """退出应用"""
        app.quit()
    
    # 注册快捷键（使用窗口作为父对象）
    shortcut_manager.parent = window
    shortcut_manager.register_shortcut("toggle", config.shortcut_toggle, toggle_window)
    shortcut_manager.register_shortcut("stats", config.shortcut_stats, open_stats)
    shortcut_manager.register_shortcut("quit", config.shortcut_quit, quit_app)
    
    # 保存配置（确保快捷键配置被保存）
    save_config(config)
    
    code = app.exec_()
    tray.hide()
    proxy.stop()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
