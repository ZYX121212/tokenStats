import sys

from PyQt5.QtWidgets import QApplication, QMessageBox

from .config import DB_PATH, load_config
from .proxy import ProxyServer
from .storage import TokenStore
from .ui import FloatingWindow, StatsDialog, make_tray_icon


def main() -> int:
    config = load_config()
    store = TokenStore(DB_PATH)
    proxy = ProxyServer(config, store)

    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
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
    tray = make_tray_icon(app, window, open_stats, window.open_settings)
    window.set_tray_icon(tray)
    code = app.exec_()
    tray.hide()
    proxy.stop()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
