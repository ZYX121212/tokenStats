import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict


APP_DIR = Path.home() / ".tokenstats"
CONFIG_PATH = APP_DIR / "config.json"
DB_PATH = APP_DIR / "tokenstats.sqlite3"


@dataclass
class ProviderConfig:
    api_key: str = ""
    base_url: str = ""
    enabled: bool = True
    provider_type: str = "openai_compatible"
    auth_mode: str = "bearer"


@dataclass
class AppConfig:
    proxy_host: str = "127.0.0.1"
    proxy_port: int = 8765
    alert_threshold_5m: int = 20000
    opacity: float = 0.92
    theme: str = "modern_light"
    always_on_top: bool = True
    lock_position: bool = False
    show_on_start: bool = True
    window_x: int = 40
    window_y: int = 80
    currency: str = "USD"
    usd_to_cny: float = 7.25
    
    # 新增：悬浮窗配置
    floating_width: int = 220
    floating_height: int = 150
    floating_scale: float = 1.0
    snap_to_edge: bool = True
    
    # 新增：快捷键配置
    shortcut_toggle: str = "Ctrl+Shift+T"
    shortcut_stats: str = "Ctrl+Shift+S"
    shortcut_quit: str = "Ctrl+Shift+Q"
    
    # 新增：通知配置
    enable_notifications: bool = True
    daily_report: bool = True
    
    # 新增：备份配置
    auto_backup: bool = True
    backup_retention_days: int = 30
    model_prices: Dict[str, Dict[str, float]] = field(
        default_factory=lambda: {
            "GPT-4o": {"input": 2.50, "output": 10.00},
            "GPT-4o mini": {"input": 0.15, "output": 0.60},
            "GPT-4.1": {"input": 2.00, "output": 8.00},
            "GPT-4.1 mini": {"input": 0.40, "output": 1.60},
            "Claude 3.5 Sonnet": {"input": 3.00, "output": 15.00},
            "Claude 3.7 Sonnet": {"input": 3.00, "output": 15.00},
            "Claude Sonnet 4": {"input": 3.00, "output": 15.00},
            "Gemini 1.5 Pro": {"input": 1.25, "output": 5.00},
            "Gemini 1.5 Flash": {"input": 0.075, "output": 0.30},
            "Gemini 2.0 Flash": {"input": 0.10, "output": 0.40},
            "DeepSeek Chat": {"input": 0.27, "output": 1.10},
            "DeepSeek Reasoner": {"input": 0.55, "output": 2.19},
        }
    )
    providers: Dict[str, ProviderConfig] = field(
        default_factory=lambda: {
            "openai": ProviderConfig(base_url="https://api.openai.com", provider_type="openai_compatible", auth_mode="bearer"),
            "anthropic": ProviderConfig(base_url="https://api.anthropic.com", provider_type="anthropic", auth_mode="anthropic"),
            "gemini": ProviderConfig(base_url="https://generativelanguage.googleapis.com", provider_type="gemini", auth_mode="gemini"),
            "compatible": ProviderConfig(base_url="https://api.deepseek.com", provider_type="openai_compatible", auth_mode="bearer"),
            "relay1": ProviderConfig(base_url="", enabled=False, provider_type="openai_compatible", auth_mode="bearer"),
            "relay2": ProviderConfig(base_url="", enabled=False, provider_type="openai_compatible", auth_mode="bearer"),
            "relay3": ProviderConfig(base_url="", enabled=False, provider_type="openai_compatible", auth_mode="pass_through"),
        }
    )


def load_config() -> AppConfig:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_PATH.exists():
        cfg = AppConfig()
        save_config(cfg)
        return cfg

    raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    providers = {}
    for name, value in raw.get("providers", {}).items():
        providers[name] = ProviderConfig(
            api_key=value.get("api_key", ""),
            base_url=value.get("base_url", ""),
            enabled=bool(value.get("enabled", True)),
            provider_type=value.get("provider_type", "openai_compatible"),
            auth_mode=value.get("auth_mode", "bearer"),
        )
    defaults = AppConfig()
    prices = raw.get("model_prices", {})
    merged_prices = defaults.model_prices
    if isinstance(prices, dict):
        for model, value in prices.items():
            if isinstance(value, dict):
                merged_prices[model] = {
                    "input": float(value.get("input", 0) or 0),
                    "output": float(value.get("output", 0) or 0),
                }
    cfg = AppConfig(
        proxy_host=raw.get("proxy_host", "127.0.0.1"),
        proxy_port=int(raw.get("proxy_port", 8765)),
        alert_threshold_5m=int(raw.get("alert_threshold_5m", 20000)),
        opacity=float(raw.get("opacity", 0.92)),
        theme=raw.get("theme", "modern_light"),
        always_on_top=bool(raw.get("always_on_top", True)),
        lock_position=bool(raw.get("lock_position", False)),
        show_on_start=bool(raw.get("show_on_start", True)),
        window_x=int(raw.get("window_x", 40)),
        window_y=int(raw.get("window_y", 80)),
        currency=raw.get("currency", "USD"),
        usd_to_cny=float(raw.get("usd_to_cny", 7.25)),
        floating_width=int(raw.get("floating_width", 220)),
        floating_height=int(raw.get("floating_height", 150)),
        floating_scale=float(raw.get("floating_scale", 1.0)),
        snap_to_edge=bool(raw.get("snap_to_edge", True)),
        shortcut_toggle=raw.get("shortcut_toggle", "Ctrl+Shift+T"),
        shortcut_stats=raw.get("shortcut_stats", "Ctrl+Shift+S"),
        shortcut_quit=raw.get("shortcut_quit", "Ctrl+Shift+Q"),
        enable_notifications=bool(raw.get("enable_notifications", True)),
        daily_report=bool(raw.get("daily_report", True)),
        auto_backup=bool(raw.get("auto_backup", True)),
        backup_retention_days=int(raw.get("backup_retention_days", 30)),
        model_prices=merged_prices,
        providers=providers or defaults.providers,
    )
    for name, provider in defaults.providers.items():
        cfg.providers.setdefault(name, provider)
    return cfg


def save_config(config: AppConfig) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps(asdict(config), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def export_config(config: AppConfig, file_path: Path) -> None:
    """导出配置到指定文件"""
    data = asdict(config)
    file_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def import_config(file_path: Path) -> AppConfig:
    """从文件导入配置"""
    raw = json.loads(file_path.read_text(encoding="utf-8"))
    providers = {}
    for name, value in raw.get("providers", {}).items():
        providers[name] = ProviderConfig(
            api_key=value.get("api_key", ""),
            base_url=value.get("base_url", ""),
            enabled=bool(value.get("enabled", True)),
            provider_type=value.get("provider_type", "openai_compatible"),
            auth_mode=value.get("auth_mode", "bearer"),
        )
    defaults = AppConfig()
    prices = raw.get("model_prices", {})
    merged_prices = defaults.model_prices
    if isinstance(prices, dict):
        for model, value in prices.items():
            if isinstance(value, dict):
                merged_prices[model] = {
                    "input": float(value.get("input", 0) or 0),
                    "output": float(value.get("output", 0) or 0),
                }
    cfg = AppConfig(
        proxy_host=raw.get("proxy_host", "127.0.0.1"),
        proxy_port=int(raw.get("proxy_port", 8765)),
        alert_threshold_5m=int(raw.get("alert_threshold_5m", 20000)),
        opacity=float(raw.get("opacity", 0.92)),
        theme=raw.get("theme", "modern_light"),
        always_on_top=bool(raw.get("always_on_top", True)),
        lock_position=bool(raw.get("lock_position", False)),
        show_on_start=bool(raw.get("show_on_start", True)),
        window_x=int(raw.get("window_x", 40)),
        window_y=int(raw.get("window_y", 80)),
        currency=raw.get("currency", "USD"),
        usd_to_cny=float(raw.get("usd_to_cny", 7.25)),
        floating_width=int(raw.get("floating_width", 220)),
        floating_height=int(raw.get("floating_height", 150)),
        floating_scale=float(raw.get("floating_scale", 1.0)),
        snap_to_edge=bool(raw.get("snap_to_edge", True)),
        shortcut_toggle=raw.get("shortcut_toggle", "Ctrl+Shift+T"),
        shortcut_stats=raw.get("shortcut_stats", "Ctrl+Shift+S"),
        shortcut_quit=raw.get("shortcut_quit", "Ctrl+Shift+Q"),
        enable_notifications=bool(raw.get("enable_notifications", True)),
        daily_report=bool(raw.get("daily_report", True)),
        auto_backup=bool(raw.get("auto_backup", True)),
        backup_retention_days=int(raw.get("backup_retention_days", 30)),
        model_prices=merged_prices,
        providers=providers or defaults.providers,
    )
    for name, provider in defaults.providers.items():
        cfg.providers.setdefault(name, provider)
    return cfg
